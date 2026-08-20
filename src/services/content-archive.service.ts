import type { ContentItem, PlatformContentVariant } from '../core/types';
import { GoogleDriveAdapter, type DriveUploadResult } from '../integrations/google-drive.adapter';
import { Store } from '../repositories/store';

export interface ContentArchiveResult {
  content: ContentItem;
  file: DriveUploadResult;
  folderId: string;
  folderUrl: string;
}

export class ContentArchiveService {
  constructor(
    private readonly store: Store,
    private readonly drive: GoogleDriveAdapter,
  ) {}

  async archive(contentId: string): Promise<ContentArchiveResult> {
    const content = await this.store.getContent(contentId);
    if (!content.sourceReportId) throw new Error('Content has no sourceReportId; cannot create a report-specific Drive folder.');
    const report = await this.store.getReport(content.sourceReportId);
    const rootFolderId = await this.drive.ensureExportFolder();
    if (!rootFolderId) throw new Error('Google Drive export folder is unavailable.');

    const folderName = sanitizeDriveName(report.title || `Report ${report.id}`);
    const folderId = await this.drive.ensureChildFolder(folderName, rootFolderId);
    const fileName = `محتوى — ${sanitizeDriveName(content.title)} — ${content.id.slice(0, 8)}.md`;
    const file = await this.drive.upsertText(fileName, renderContentMarkdown(content, report), 'text/markdown; charset=utf-8', folderId);
    if (!file?.id || !file.webViewLink) throw new Error('Google Drive did not return an archived content link.');

    const hasAsset = content.assets.some((asset) => asset.provider === 'google-drive' && asset.providerId === file.id);
    const urls = [...new Set([...(content.googleDriveUrls ?? []), file.webViewLink])];
    const assets = hasAsset
      ? content.assets
      : [...content.assets, { kind: 'document' as const, url: file.webViewLink, provider: 'google-drive' as const, providerId: file.id }];
    const updated = await this.store.updateContent(content.id, { googleDriveUrls: urls, assets });

    return {
      content: updated,
      file,
      folderId,
      folderUrl: this.drive.folderUrl(folderId),
    };
  }
}

function renderContentMarkdown(content: ContentItem, report: { title: string; source?: string; createdAt: string }) {
  const pkg = content.package ?? {};
  const lines: string[] = [
    `# ${content.title}`,
    '',
    `**التقرير المصدر:** ${report.title}`,
    `**تاريخ التقرير:** ${report.createdAt}`,
    report.source ? `**المصدر:** ${report.source}` : '',
    `**الحالة:** ${content.status}`,
    `**المنصات:** ${content.platforms.join('، ')}`,
    '',
    '## الفكرة الرئيسية',
    pkg.hook ?? '',
    '',
    '## الكابشن العام',
    pkg.caption ?? '',
    '',
    '## CTA',
    pkg.cta ?? '',
    '',
    '## الوصف',
    pkg.description ?? '',
    '',
    '## السكريبت',
    pkg.script ?? '',
    '',
    '## كلمات مفتاحية',
    (pkg.keywords ?? []).join('، '),
    '',
    '## Prompt الصورة',
    pkg.imagePrompt ?? '',
    '',
    '## Prompt الفيديو',
    pkg.videoPrompt ?? '',
    '',
    '## نسخ المنصات',
  ];

  for (const [platform, copy] of Object.entries(pkg.platformCopies ?? {})) {
    appendPlatform(lines, platform, copy);
  }

  lines.push('', '## Carousel');
  for (const [index, slide] of (pkg.carouselSlides ?? []).entries()) {
    lines.push(`### الشريحة ${index + 1}: ${slide.title ?? ''}`);
    if (slide.body) lines.push(slide.body);
    for (const point of slide.points ?? []) lines.push(`- ${point}`);
    lines.push('');
  }

  lines.push('## مشاهد الفيديو');
  for (const [index, scene] of (pkg.videoScenes ?? []).entries()) {
    lines.push(`### المشهد ${index + 1}: ${scene.title ?? ''}`);
    if (scene.body) lines.push(scene.body);
    lines.push('');
  }

  if (pkg.qualityReview) {
    lines.push('## مراجعة الجودة', '```json', JSON.stringify(pkg.qualityReview, null, 2), '```', '');
  }

  lines.push(`_تم الحفظ تلقائيًا بواسطة Ghaith Web Content OS في ${new Date().toISOString()}._`);
  return lines.filter((line) => line !== undefined).join('\n');
}

function appendPlatform(lines: string[], platform: string, copy: PlatformContentVariant) {
  lines.push('', `### ${platform.toUpperCase()}`);
  if (copy.title) lines.push(`**العنوان:** ${copy.title}`);
  if (copy.hook) lines.push(`**Hook:** ${copy.hook}`);
  if (copy.caption) lines.push(`**Caption:**\n${copy.caption}`);
  if (copy.description) lines.push(`**Description:**\n${copy.description}`);
  if (copy.cta) lines.push(`**CTA:** ${copy.cta}`);
  if (copy.hashtags?.length) lines.push(`**Hashtags:** ${copy.hashtags.map((tag) => tag.startsWith('#') ? tag : `#${tag}`).join(' ')}`);
}

function sanitizeDriveName(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Ghaith Web Report';
}
