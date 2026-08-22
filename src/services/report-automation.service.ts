import type { ContentItem, Opportunity, ProductDraft } from '../core/types';
import { Store } from '../repositories/store';
import { NotificationService } from './notification.service';

export class ReportAutomationService {
  private readonly notifications: NotificationService;

  constructor(private readonly store: Store) {
    this.notifications = new NotificationService(store);
  }

  async status(reportId: string) {
    const report = await this.store.getReport(reportId);
    const [opportunities, contents, products] = await Promise.all([
      this.store.listOpportunities(),
      this.store.listContents(),
      this.store.listProducts(),
    ]);
    const reportOpportunities = opportunities.filter((item) => item.reportId === report.id);
    const reportContents = contents.filter((item) => item.sourceReportId === report.id && item.status !== 'ARCHIVED');
    const reportProducts = products.filter((item) => item.reportId === report.id && item.status !== 'ARCHIVED');
    const content = pickContent(reportContents, report.automation?.contentId);
    const product = pickProduct(reportProducts, report.automation?.productId);
    const assetsReady = Boolean(content && hasReviewableMedia(content));
    const complete = Boolean(report.googleDriveUrl && reportOpportunities.length && content && assetsReady && product?.googleDriveUrl);
    return {
      report,
      archived: Boolean(report.googleDriveUrl),
      opportunitiesReady: reportOpportunities.length > 0,
      opportunityId: report.automation?.opportunityId ?? reportOpportunities[0]?.id,
      contentReady: Boolean(content),
      contentId: content?.id,
      assetsReady,
      productReadyForReview: Boolean(product?.googleDriveUrl),
      productId: product?.id,
      complete,
    };
  }

  async markOpportunitiesReady(reportId: string, opportunities: Opportunity[]) {
    if (!opportunities.length) return this.store.getReport(reportId);
    const report = await this.store.getReport(reportId);
    const selected = [...opportunities].sort((a, b) => b.score.total - a.score.total)[0]!;
    if (report.automation?.opportunitiesReadyAt) return report;
    const updated = await this.store.patchReportAutomation(reportId, {
      opportunityId: selected.id,
      opportunitiesReadyAt: new Date().toISOString(),
      lastError: undefined,
      lastErrorAt: undefined,
    });
    await this.safeNotify({
      title: 'تم تحليل التقرير واستخراج الفرص ✦',
      body: `${report.title} — تم اختيار أقوى فرصة آليًا: ${selected.title}`,
      url: '/browser.html?view=opportunities',
      tag: `report-opportunities-${report.id}`,
    });
    return updated;
  }

  async markContentReady(reportId: string, content: ContentItem) {
    const report = await this.store.getReport(reportId);
    const assetsReady = hasReviewableMedia(content);
    const contentWasNew = !report.automation?.contentReadyAt;
    const assetsWereNew = assetsReady && !report.automation?.assetsReadyAt;
    const patch: Record<string, string> = { contentId: content.id };
    if (contentWasNew) patch.contentReadyAt = new Date().toISOString();
    if (assetsWereNew) patch.assetsReadyAt = new Date().toISOString();
    const updated = await this.store.patchReportAutomation(reportId, patch);

    if (contentWasNew) {
      await this.safeNotify({
        title: 'تم إنشاء المحتوى التعليمي للمراجعة ✍️',
        body: `${content.title} — المحتوى في IN REVIEW ولن ينتقل إلى READY أو النشر دون قرارك.`,
        url: '/browser.html?view=content',
        tag: `pipeline-content-${report.id}-${content.id}`,
      });
    }
    if (assetsWereNew) {
      const mediaCount = content.assets.filter((asset) => ['image', 'carousel', 'video'].includes(asset.kind)).length;
      await this.safeNotify({
        title: 'اكتملت أصول المحتوى 🎨',
        body: `${content.title} — ${mediaCount} أصل بصري/فيديو جاهز للمراجعة ومحفوظ ضمن المسار.`,
        url: '/browser.html?view=content',
        tag: `pipeline-assets-${report.id}-${content.id}`,
      });
    }
    return updated;
  }

  async complete(reportId: string) {
    const current = await this.status(reportId);
    if (!current.complete) {
      return { ok: false, completed: false, waiting: true, status: current };
    }
    if (current.report.automation?.completedAt) {
      return { ok: true, completed: true, alreadyCompleted: true, status: current };
    }
    const completedAt = new Date().toISOString();
    const report = await this.store.patchReportAutomation(reportId, {
      opportunityId: current.opportunityId,
      contentId: current.contentId,
      productId: current.productId,
      opportunitiesReadyAt: current.report.automation?.opportunitiesReadyAt ?? completedAt,
      contentReadyAt: current.report.automation?.contentReadyAt ?? completedAt,
      assetsReadyAt: current.report.automation?.assetsReadyAt ?? completedAt,
      productReadyForReviewAt: current.report.automation?.productReadyForReviewAt ?? completedAt,
      completedAt,
      lastError: undefined,
      lastErrorAt: undefined,
    });
    await this.safeNotify({
      title: 'اكتملت معالجة التقرير آليًا ✅',
      body: `${report.title} — التقرير محفوظ، الفرص مستخرجة، المحتوى والأصول جاهزة للمراجعة، والمنتج الأولي محفوظ. الآن القرار التالي لك.`,
      url: '/browser.html?view=reports',
      tag: `report-automation-complete-${report.id}`,
    });
    return { ok: true, completed: true, alreadyCompleted: false, status: await this.status(reportId) };
  }

  async recordError(reportId: string, message: string) {
    const report = await this.store.getReport(reportId);
    const safe = message.trim().slice(0, 300);
    await this.store.patchReportAutomation(reportId, {
      lastError: safe,
      lastErrorAt: new Date().toISOString(),
    });
    await this.safeNotify({
      title: 'توقفت خطوة آلية مؤقتًا ⚠️',
      body: `${report.title} — ${safe || 'سيعيد النظام المحاولة تلقائيًا.'}`,
      url: '/browser.html?view=reports',
      tag: `report-automation-error-${report.id}`,
    });
  }

  private async safeNotify(notification: { title: string; body: string; url: string; tag: string }) {
    try { await this.notifications.send(notification); }
    catch (error) { console.warn('Report automation notification failed', error); }
  }
}

function hasReviewableMedia(content: ContentItem): boolean {
  return content.assets.some((asset) => ['image', 'carousel', 'video'].includes(asset.kind));
}

function pickContent(items: ContentItem[], preferred?: string) {
  return items.find((item) => item.id === preferred) ?? [...items].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
}
function pickProduct(items: ProductDraft[], preferred?: string) {
  return items.find((item) => item.id === preferred) ?? [...items].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
}
