import type { ProductDraft, Report } from '../core/types';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import { Store } from '../repositories/store';

export class ProductArchiveService {
  private readonly drive: GoogleDriveAdapter;

  constructor(private readonly store: Store, drive?: GoogleDriveAdapter) {
    this.drive = drive ?? new GoogleDriveAdapter(store);
  }

  async archive(productId: string) {
    const product = await this.store.getProduct(productId);
    const report = await this.store.getReport(product.reportId);
    const root = await this.drive.ensureExportFolder();
    if (!root) throw new Error('Google Drive export folder is unavailable.');

    const reportFolder = await this.drive.ensureChildFolder(sanitize(report.title) || `Report ${report.id}`, root);
    const productsFolder = await this.drive.ensureChildFolder('منتجات أولية — للمراجعة', reportFolder);
    const productFolder = await this.drive.ensureChildFolder(sanitize(product.title) || `Product ${product.id}`, productsFolder);

    const markdown = await this.drive.upsertText(
      `منتج أولي — ${sanitize(product.title)}.md`,
      renderProduct(product, report),
      'text/markdown; charset=utf-8',
      productFolder,
    );
    await this.drive.upsertText(
      'بيانات المنتج.json',
      JSON.stringify(product, null, 2),
      'application/json; charset=utf-8',
      productFolder,
    );
    if (!markdown?.webViewLink) throw new Error('Google Drive did not return a product link.');

    return this.store.updateProduct(product.id, {
      googleDriveUrl: markdown.webViewLink,
      googleDriveFolderUrl: this.drive.folderUrl(productFolder),
    });
  }
}

function renderProduct(product: ProductDraft, report: Report) {
  return [
    `# ${product.title}`,
    '',
    '> **الحالة:** منتج أولي آلي للمراجعة البشرية. لا يُعتبر PRODUCT READY ولا يُسوَّق أو يُباع تلقائيًا.',
    '',
    `**النوع:** ${product.productType}`,
    `**الجمهور:** ${product.targetAudience}`,
    `**التقرير المصدر:** ${report.title}`,
    report.source ? `**المصدر:** ${report.source}` : '',
    '',
    '## المشكلة',
    product.problem,
    '',
    '## الوعد العملي',
    product.promise,
    '',
    '## المخرجات',
    ...product.deliverables.map((item) => `- ${item}`),
    '',
    '## الهيكل',
    ...product.outline.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## المسودة الكاملة',
    product.draftBody,
    '',
    '## Prompt الغلاف',
    product.coverPrompt ?? '',
    '',
    '## مراجعة الجودة',
    '```json',
    JSON.stringify(product.qualityReview ?? {}, null, 2),
    '```',
    '',
    '_الخطوة التالية بقرار المستخدم: اعتماد للتطوير، تحسين، أو أرشفة. لا يوجد نشر/بيع تلقائي._',
  ].filter(Boolean).join('\n');
}

function sanitize(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
}
