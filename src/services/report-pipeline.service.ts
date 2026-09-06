import { AppError } from '../core/errors';
import { Store } from '../repositories/store';
import { IntelligenceService } from './intelligence.service';
import { ProductGenerationService } from './product-generation.service';
import { ReportArchiveService } from './report-archive.service';
import { ReportAutomationService } from './report-automation.service';

// v18 starts automatic preparation for reports arriving from this deployment window onward.
// Reports that already have automation state are also resumable. This prevents a legacy
// normal-report backlog from unexpectedly consuming free AI/Drive quota after rollout.
const AUTO_PIPELINE_CUTOVER = Date.parse('2026-08-22T09:00:00Z');

export class ReportPipelineService {
  private readonly intelligence: IntelligenceService;
  private readonly products: ProductGenerationService;
  private readonly archive: ReportArchiveService;
  private readonly automation: ReportAutomationService;

  constructor(private readonly store: Store) {
    this.intelligence = new IntelligenceService(store);
    this.products = new ProductGenerationService(store);
    this.archive = new ReportArchiveService(store);
    this.automation = new ReportAutomationService(store);
  }

  async nextPendingReport() {
    const reports = await this.store.listReports();
    const pending = reports
      .filter((report) => !String(report.source ?? '').startsWith('Historical Gmail report summary'))
      .filter((report) => Boolean(report.automation) || +new Date(report.createdAt) >= AUTO_PIPELINE_CUTOVER)
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

      // Content/product creation is now authored by Ghaith Web Content Pro in ChatGPT.
      // The scheduled pipeline deliberately waits instead of asking Gemini or a fallback renderer
      // to invent a second, lower-quality package. POST /api/automation/gpt-intake resumes the
      // same durable pipeline without changing the approval/publishing architecture.
      if (!status.contentReady) {
        const opportunityId = status.opportunityId;
        if (!opportunityId) throw new AppError('No selected opportunity is available.', 409, 'PIPELINE_INCOMPLETE');
        return {
          ok: true,
          idle: true,
          reportId: report.id,
          opportunityId,
          stage: 'WAITING_FOR_GPT_PACKAGE',
          message: 'Waiting for the final GPT-authored package. Gemini content generation is intentionally skipped.',
        };
      }

      if (!status.assetsReady) {
        return {
          ok: true,
          idle: true,
          reportId: report.id,
          contentId: status.contentId,
          stage: 'WAITING_FOR_GPT_ASSETS',
          message: 'Waiting for the Canva/final media attached by GPT intake. Automatic fallback media generation is intentionally skipped.',
        };
      }

      if (!status.productReadyForReview) {
        return {
          ok: true,
          idle: true,
          reportId: report.id,
          opportunityId: status.opportunityId,
          stage: 'WAITING_FOR_GPT_PRODUCT',
          message: 'Waiting for the GPT-authored product draft. Automatic Gemini product generation is intentionally skipped.',
        };
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

  /** Manual fallback only. Scheduled automation no longer calls this automatically. */
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
