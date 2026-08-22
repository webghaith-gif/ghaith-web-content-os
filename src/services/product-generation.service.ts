import type { ProductDraft } from '../core/types';
import { OpenAIAdapter } from '../integrations/openai.adapter';
import { Store } from '../repositories/store';
import { NotificationService } from './notification.service';
import { ProductArchiveService } from './product-archive.service';

export class ProductGenerationService {
  private readonly archive: ProductArchiveService;
  private readonly notifications: NotificationService;

  constructor(
    private readonly store: Store,
    private readonly ai = new OpenAIAdapter(),
  ) {
    this.archive = new ProductArchiveService(store);
    this.notifications = new NotificationService(store);
  }

  async createFromOpportunity(opportunityId: string, oidcToken?: string): Promise<ProductDraft> {
    const opportunity = await this.store.getOpportunity(opportunityId);
    const report = await this.store.getReport(opportunity.reportId);
    const existing = (await this.store.listProducts()).find((item) => item.opportunityId === opportunityId && item.status !== 'ARCHIVED');

    let product = existing;
    if (!product) {
      const generated = this.ai.enabledFor(oidcToken)
        ? await this.generateWithAi({
            title: opportunity.title,
            rationale: opportunity.rationale,
            reportTitle: report.title,
            reportBody: report.body,
            reportSource: report.source,
            oidcToken,
          }).catch(() => fallbackProduct(opportunity.title, opportunity.rationale, report.body))
        : fallbackProduct(opportunity.title, opportunity.rationale, report.body);

      const outcome = await this.store.createProduct({
        reportId: report.id,
        opportunityId: opportunity.id,
        title: generated.title,
        productType: generated.productType,
        targetAudience: generated.targetAudience,
        problem: generated.problem,
        promise: generated.promise,
        deliverables: generated.deliverables,
        outline: generated.outline,
        draftBody: generated.draftBody,
        coverPrompt: generated.coverPrompt,
        qualityReview: generated.qualityReview,
        status: 'IN_REVIEW',
      });
      product = outcome.product;
    }

    if (!product.googleDriveUrl || !product.googleDriveFolderUrl) {
      product = await this.archive.archive(product.id);
    }

    const latestReport = await this.store.getReport(report.id);
    if (!latestReport.automation?.productReadyForReviewAt) {
      const now = new Date().toISOString();
      await this.store.patchReportAutomation(report.id, {
        productId: product.id,
        productReadyForReviewAt: now,
      });
      try {
        await this.notifications.send({
          title: 'منتج أولي جاهز للمراجعة 📦',
          body: `${product.title} — تم حفظ المسودة والهيكل في Google Drive. القرار التالي لك.`,
          url: '/browser.html?view=products',
          tag: `product-review-${product.id}`,
        });
      } catch (error) {
        console.warn('Product review notification failed', error);
      }
    }

    return product;
  }

  async approve(productId: string, approvedBy = 'user') {
    const product = await this.store.getProduct(productId);
    if (product.status === 'ARCHIVED') throw new Error('Archived product cannot be approved.');
    if (product.status === 'PRODUCT_READY' || product.status === 'APPROVED') return product;
    return this.store.updateProduct(product.id, {
      status: 'APPROVED',
      approvedBy,
      approvedAt: new Date().toISOString(),
    });
  }

  async archiveProduct(productId: string) {
    return this.store.updateProduct(productId, { status: 'ARCHIVED' });
  }

  private async generateWithAi(input: {
    title: string;
    rationale: string;
    reportTitle: string;
    reportBody: string;
    reportSource?: string;
    oidcToken?: string;
  }) {
    const text = await this.ai.generateText(
      [
        'You are the digital-product development engine for Ghaith Web.',
        'Create a useful Arabic MVP product draft grounded strictly in the supplied report and selected opportunity.',
        'This is an internal product draft for human review, NOT a sales page and NOT PRODUCT READY.',
        'Do not invent statistics, legal claims, prices, testimonials, credentials, links, or product features unsupported by the source.',
        'Do not write promotional copy or purchase/download CTAs.',
        'Prefer a practical low-cost digital product such as a guide, checklist, workbook, planner, template pack, lesson resource, or prompt/workflow pack when appropriate.',
        'Return JSON only with keys: title, productType, targetAudience, problem, promise, deliverables, outline, draftBody, coverPrompt, qualityReview.',
        'deliverables: 3-8 concrete items. outline: 4-12 sections.',
        'draftBody: a coherent Arabic MVP draft that a human can genuinely review, with headings, explanations, checklists/examples where appropriate. Aim for useful completeness rather than hype.',
        'qualityReview: {score, strengths, risks, sourceFaithful, usefulWithoutHype, readyForHumanReview}.',
        'Use clear Modern Standard Arabic suitable for Tunisia and the wider Arab audience.',
      ].join(' '),
      [
        `SOURCE REPORT TITLE: ${input.reportTitle}`,
        `SOURCE REPORT: ${input.reportBody.slice(0, 18000)}`,
        `SOURCE NOTE: ${input.reportSource ?? 'not provided'}`,
        `SELECTED OPPORTUNITY: ${input.title}`,
        `RATIONALE: ${input.rationale}`,
      ].join('\n\n'),
      input.oidcToken,
    );
    const parsed = JSON.parse(text);
    return normalizeProduct(parsed, input.title, input.rationale, input.reportBody);
  }
}

function normalizeProduct(value: any, title: string, rationale: string, reportBody: string) {
  const fallback = fallbackProduct(title, rationale, reportBody);
  return {
    title: str(value?.title) || fallback.title,
    productType: str(value?.productType) || fallback.productType,
    targetAudience: str(value?.targetAudience) || fallback.targetAudience,
    problem: str(value?.problem) || fallback.problem,
    promise: str(value?.promise) || fallback.promise,
    deliverables: stringArray(value?.deliverables, 8).length ? stringArray(value?.deliverables, 8) : fallback.deliverables,
    outline: stringArray(value?.outline, 12).length ? stringArray(value?.outline, 12) : fallback.outline,
    draftBody: str(value?.draftBody) || fallback.draftBody,
    coverPrompt: str(value?.coverPrompt) || fallback.coverPrompt,
    qualityReview: normalizeQuality(value?.qualityReview),
  };
}

function fallbackProduct(title: string, rationale: string, reportBody: string) {
  const excerpt = reportBody.replace(/\s+/g, ' ').trim().slice(0, 1800);
  return {
    title: `دليل عملي: ${title}`.slice(0, 160),
    productType: 'دليل عملي / Workbook',
    targetAudience: 'جمهور غيث ويب المهتم بالتعليم والذكاء الاصطناعي والعمل الرقمي',
    problem: rationale || title,
    promise: `تحويل موضوع «${title}» إلى خطوات عملية واضحة قابلة للتطبيق والمراجعة.`,
    deliverables: ['دليل عملي منظم', 'قائمة خطوات تنفيذ', 'قائمة تحقق للمراجعة', 'أمثلة أو تطبيقات مستندة إلى التقرير'],
    outline: ['المشكلة والسياق', 'ما الذي نعرفه من التقرير', 'الخطوات العملية', 'أمثلة وتطبيقات', 'قائمة التحقق', 'الخطوة التالية'],
    draftBody: `## مقدمة\n${rationale || title}\n\n## ما الذي نعرفه من التقرير؟\n${excerpt || 'يُراجع التقرير المصدر قبل اعتماد النسخة النهائية.'}\n\n## خطة عملية\n1. حدّد الهدف بدقة.\n2. طبّق الخطوات الملائمة للسياق.\n3. راجع النتيجة وقارنها بالمصدر.\n4. حسّن النسخة قبل اعتمادها.\n\n## قائمة تحقق\n- هل كل معلومة مدعومة بالمصدر؟\n- هل الخطوات واضحة وقابلة للتطبيق؟\n- هل توجد مبالغة أو وعود غير مثبتة؟\n- هل يحتاج المنتج إلى أصول أو أمثلة إضافية؟\n\n## قرار المراجعة\nهذه مسودة MVP وليست PRODUCT READY. راجعها ثم قرر: اعتماد للتطوير، تحسين، أو أرشفة.`,
    coverPrompt: `Professional premium Arabic digital guide cover for Ghaith Web about: ${title}; elegant navy, gold and beige visual identity; clear Arabic typography; no misleading claims.`,
    qualityReview: {
      score: 55,
      strengths: ['مسودة أولية قابلة للمراجعة', 'مرتبطة بالتقرير المصدر'],
      risks: ['تحتاج مراجعة بشرية قبل الاعتماد النهائي'],
      sourceFaithful: true,
      usefulWithoutHype: true,
      readyForHumanReview: true,
    },
  };
}

function normalizeQuality(value: any) {
  const score = Number(value?.score);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    strengths: stringArray(value?.strengths, 8),
    risks: stringArray(value?.risks, 8),
    sourceFaithful: value?.sourceFaithful !== false,
    usefulWithoutHype: value?.usefulWithoutHype !== false,
    readyForHumanReview: value?.readyForHumanReview !== false,
  };
}

function str(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function stringArray(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.map(String).map((x) => x.trim()).filter(Boolean).slice(0, max) : [];
}
