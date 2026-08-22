import { AppError } from '../core/errors';
import { Store } from '../repositories/store';
import { AssetService } from './asset.service';
import { ContentGenerationService } from './content-generation.service';
import { IntelligenceService } from './intelligence.service';
import { ProductGenerationService } from './product-generation.service';
import { ReportArchiveService } from './report-archive.service';
import { ReportAutomationService } from './report-automation.service';

export class ReportPipelineService {
  private readonly intelligence: IntelligenceService;
  private readonly generation: ContentGenerationService;
  private readonly assets: AssetService;
  private readonly products: ProductGenerationService;
  private readonly archive: ReportArchiveService;
  private readonly automation: ReportAutomationService;

  constructor(private readonly store: Store) {
    this.intelligence = new IntelligenceService(store);
    this.generation = new ContentGenerationService(store);
    this.assets = new AssetService(store);
    this.products = new ProductGenerationService(store);
    this.archive = new ReportArchiveService(store);
    this.automation = new ReportAutomationService(store);
  }

  async nextPendingReport() {
    const reports = await this.store.listReports();
    const pending = reports
      // Historical Gmail summaries keep their dedicated slow backfill workflow.
      // Excluding them here prevents a legacy backlog from consuming free AI/Drive quota
      // when this new automation is enabled. Normal and future reports are fully automatic.
      .filter((report) => !String(report.source ?? '').startsWith('Historical Gmail report summary'))
      .filter((report) => !report.automation?.completedAt)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return pending[0] ?? null;
  }

  async status(reportId: string) {
    return this.automation.status(reportId);
  }

  async processNextStage(oidcToken?: string) {
    const report = await this.nextPendingReport();
    if (!report) return { ok: true, idle: true, message: 'No pending reports.' };

    try {
      let status = await this.automation.status(report.id);

      if (!status.archived) {
        const archived = await this.archive.archive(report.id);
        return { ok: true, idle: false, reportId: report.id, stage: 'ARCHIVED_TO_DRIVE', report: archived };
      }

      if (!status.opportunitiesReady) {
        const opportunities = await this.intelligence.extractOpportunities(report.id, oidcToken);
        if (!opportunities.length) throw new AppError('No opportunities were produced from this report.', 422, 'NO_OPPORTUNITIES');
        await this.automation.markOpportunitiesReady(report.id, opportunities);
        return { ok: true, idle: false, reportId: report.id, stage: 'OPPORTUNITIES_READY', count: opportunities.length };
      }

      if (!status.contentReady) {
        const opportunityId = status.opportunityId;
        if (!opportunityId) throw new AppError('No selected opportunity is available.', 409, 'PIPELINE_INCOMPLETE');
        const content = await this.generation.createFromOpportunity(
          opportunityId,
          ['facebook', 'instagram', 'tiktok', 'pinterest', 'youtube'],
          oidcToken,
        );
        await this.automation.markContentReady(report.id, content);
        return {
          ok: true,
          idle: false,
          reportId: report.id,
          stage: (content.assets?.length ?? 0) > 0 ? 'CONTENT_AND_ASSETS_READY' : 'CONTENT_READY',
          contentId: content.id,
        };
      }

      if (!status.assetsReady) {
        if (!status.contentId) throw new AppError('Content is missing from the pipeline.', 409, 'PIPELINE_INCOMPLETE');
        const content = await this.assets.requestAssets(status.contentId);
        await this.automation.markContentReady(report.id, content);
        return { ok: true, idle: false, reportId: report.id, stage: 'ASSETS_READY', contentId: content.id, assets: content.assets.length };
      }

      if (!status.productReadyForReview) {
        const opportunityId = status.opportunityId;
        if (!opportunityId) throw new AppError('No selected opportunity is available for product generation.', 409, 'PIPELINE_INCOMPLETE');
        const product = await this.products.createFromOpportunity(opportunityId, oidcToken);
        return { ok: true, idle: false, reportId: report.id, stage: 'PRODUCT_READY_FOR_REVIEW', productId: product.id };
      }

      status = await this.automation.status(report.id);
      if (!status.complete) throw new AppError('Pipeline prerequisites are incomplete.', 409, 'PIPELINE_INCOMPLETE');
      const completed = await this.automation.complete(report.id);
      return { ...completed, idle: false, reportId: report.id, stage: 'PIPELINE_COMPLETE' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.automation.recordError(report.id, message).catch(() => undefined);
      throw error;
    }
  }

  async createProduct(opportunityId: string, oidcToken?: string) {
    return this.products.createFromOpportunity(opportunityId, oidcToken);
  }

  async approveProduct(productId: string) {
    return this.products.approve(productId);
  }

  async archiveProduct(productId: string) {
    return this.products.archiveProduct(productId);
  }
}
