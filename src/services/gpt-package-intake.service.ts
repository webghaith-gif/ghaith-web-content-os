import { AppError } from '../core/errors';
import type {
  AssetRef,
  ContentItem,
  ContentPackage,
  ProductDraft,
  ProductQualityReview,
} from '../core/types';
import { env } from '../config/env';
import { CanvaOAuthManager } from '../integrations/canva-oauth';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import { Store } from '../repositories/store';
import { ContentArchiveService } from './content-archive.service';
import { ProductArchiveService } from './product-archive.service';

export interface GptCanvaDesignInput {
  kind: 'image' | 'carousel' | 'video';
  designId: string;
  title?: string;
  editUrl?: string;
  viewUrl?: string;
  platforms?: string[];
}

export interface GptProductInput {
  title: string;
  productType: string;
  targetAudience: string;
  problem: string;
  promise: string;
  deliverables: string[];
  outline: string[];
  draftBody: string;
  coverPrompt?: string;
  qualityReview?: ProductQualityReview;
}

export interface GptPackageIntakeInput {
  opportunityId: string;
  platforms: string[];
  content: {
    title?: string;
    topic?: string;
    targetAudience?: string;
    objective?: string;
    package: ContentPackage;
    /** Already-final assets may be supplied directly. Canva designs are exported separately below. */
    assets?: AssetRef[];
    canvaDesigns?: GptCanvaDesignInput[];
  };
  product?: GptProductInput;
}

interface CanvaJob {
  id?: string;
  status?: 'in_progress' | 'success' | 'failed';
  urls?: string[];
  result?: { urls?: string[] };
  error?: unknown;
}

/**
 * Intake path for content authored outside the app (normally Ghaith Web Content Pro in ChatGPT).
 *
 * The service deliberately does NOT call Gemini/OpenAI and does NOT ask Canva to author content.
 * It accepts the finished editorial package, exports already-created Canva visuals, stores publishable
 * binaries in Drive, attaches platform metadata, and updates the existing review pipeline state.
 */
export class GptPackageIntakeService {
  private readonly drive: GoogleDriveAdapter;
  private readonly contentArchive: ContentArchiveService;
  private readonly productArchive: ProductArchiveService;
  private readonly canvaOAuth: CanvaOAuthManager;

  constructor(private readonly store: Store) {
    this.drive = new GoogleDriveAdapter(store);
    this.contentArchive = new ContentArchiveService(store, this.drive);
    this.productArchive = new ProductArchiveService(store, this.drive);
    this.canvaOAuth = new CanvaOAuthManager(store);
  }

  async ingest(input: GptPackageIntakeInput) {
    const opportunityId = requiredString(input?.opportunityId, 'opportunityId');
    const platforms = normalizePlatforms(input?.platforms);
    if (!input?.content?.package || typeof input.content.package !== 'object') {
      throw new AppError('content.package is required.', 400, 'VALIDATION_ERROR');
    }

    const opportunity = await this.store.getOpportunity(opportunityId);
    const report = await this.store.getReport(opportunity.reportId);
    validatePlatformCopy(input.content.package, platforms);

    const directAssets = normalizeAssets(input.content.assets ?? []);
    const canvaDesigns = normalizeCanvaDesigns(input.content.canvaDesigns ?? []);

    let content = await this.upsertContent({
      opportunityId,
      reportId: report.id,
      opportunityTitle: opportunity.title,
      platforms,
      package: input.content.package,
      title: input.content.title,
      topic: input.content.topic,
      targetAudience: input.content.targetAudience,
      objective: input.content.objective,
      assets: directAssets,
    });

    // First archive the editorial package so the report folder exists even if a media export fails.
    const archived = await this.contentArchive.archive(content.id);
    content = archived.content;

    if (canvaDesigns.length > 0) {
      const exportedAssets = await this.exportCanvaDesigns(canvaDesigns, archived.folderId, content.title);
      const mergedAssets = dedupeAssets([...content.assets, ...exportedAssets]);
      content = await this.store.updateContent(content.id, {
        assets: mergedAssets,
        revision: content.revision + 1,
        status: 'IN_REVIEW',
      });
      content = (await this.contentArchive.archive(content.id)).content;
    }

    validatePublishingCoverage(content, platforms);

    const now = new Date().toISOString();
    await this.store.patchReportAutomation(report.id, {
      opportunityId: opportunity.id,
      opportunitiesReadyAt: report.automation?.opportunitiesReadyAt ?? now,
      contentId: content.id,
      contentReadyAt: now,
      assetsReadyAt: now,
      lastError: undefined,
      lastErrorAt: undefined,
    });

    let product: ProductDraft | undefined;
    if (input.product) {
      product = await this.upsertProduct(report.id, opportunity.id, input.product);
      product = await this.productArchive.archive(product.id);
      await this.store.patchReportAutomation(report.id, {
        productId: product.id,
        productReadyForReviewAt: now,
      });
    }

    return {
      ok: true,
      source: 'gpt-content-pro',
      reportId: report.id,
      opportunityId: opportunity.id,
      content,
      product,
      message: 'GPT-authored package accepted without AI regeneration. Canva visuals were treated as source assets, paired by platform, and archived to Drive for review.',
    };
  }

  private async upsertContent(input: {
    opportunityId: string;
    reportId: string;
    opportunityTitle: string;
    platforms: string[];
    package: ContentPackage;
    title?: string;
    topic?: string;
    targetAudience?: string;
    objective?: string;
    assets: AssetRef[];
  }): Promise<ContentItem> {
    const existing = (await this.store.listContents()).find((item) =>
      item.opportunityId === input.opportunityId
      && item.status !== 'ARCHIVED'
      && item.status !== 'PUBLISHED',
    );

    const patch = {
      title: clean(input.title) || input.opportunityTitle,
      topic: clean(input.topic) || input.opportunityTitle,
      sourceReportId: input.reportId,
      opportunityId: input.opportunityId,
      targetAudience: clean(input.targetAudience),
      objective: clean(input.objective) || 'GPT-authored package; app coordinates media, platform copy, review and publishing.',
      platforms: input.platforms,
      contentType: 'gpt-curated-multi-platform-package',
      package: input.package,
      assets: input.assets,
      status: 'IN_REVIEW' as const,
    };

    if (existing) {
      return this.store.updateContent(existing.id, {
        ...patch,
        googleDriveUrls: existing.googleDriveUrls ?? [],
        revision: existing.revision + 1,
      });
    }

    const published = (await this.store.listContents()).find((item) =>
      item.opportunityId === input.opportunityId && item.status === 'PUBLISHED',
    );
    if (published) {
      throw new AppError('A published package already exists for this opportunity. Create a new opportunity/revision before replacing it.', 409, 'LOCKED_CONTENT');
    }

    return this.store.createContent({
      ...patch,
      googleDriveUrls: [],
    });
  }

  private async upsertProduct(reportId: string, opportunityId: string, input: GptProductInput): Promise<ProductDraft> {
    validateProduct(input);
    const current = (await this.store.listProducts()).find((item) =>
      item.opportunityId === opportunityId && item.status !== 'ARCHIVED',
    );
    const patch = {
      reportId,
      opportunityId,
      title: requiredString(input.title, 'product.title'),
      productType: requiredString(input.productType, 'product.productType'),
      targetAudience: requiredString(input.targetAudience, 'product.targetAudience'),
      problem: requiredString(input.problem, 'product.problem'),
      promise: requiredString(input.promise, 'product.promise'),
      deliverables: input.deliverables.map((value) => value.trim()).filter(Boolean),
      outline: input.outline.map((value) => value.trim()).filter(Boolean),
      draftBody: requiredString(input.draftBody, 'product.draftBody'),
      coverPrompt: clean(input.coverPrompt),
      qualityReview: input.qualityReview,
      status: 'IN_REVIEW' as const,
    };
    if (current) return this.store.updateProduct(current.id, patch);
    return (await this.store.createProduct(patch)).product;
  }

  private async exportCanvaDesigns(designs: GptCanvaDesignInput[], folderId: string, contentTitle: string): Promise<AssetRef[]> {
    const token = env.CANVA_ACCESS_TOKEN ?? await this.canvaOAuth.getAccessToken();
    if (!token) throw new AppError('Canva is not authorized; cannot import Canva visuals into the app.', 503, 'INTEGRATION_DISABLED');

    const output: AssetRef[] = [];
    for (const [designIndex, design] of designs.entries()) {
      const format = design.kind === 'video' ? 'mp4' : 'png';
      const urls = await this.exportCanvaDesign(token, design.designId, format);
      if (urls.length === 0) throw new AppError(`Canva export returned no files for design ${design.designId}.`, 502, 'CANVA_EXPORT_EMPTY');

      const canvaUrl = clean(design.viewUrl) || clean(design.editUrl) || `https://www.canva.com/design/${encodeURIComponent(design.designId)}`;
      output.push({
        kind: design.kind,
        url: canvaUrl,
        provider: 'canva',
        providerId: design.designId,
        platforms: design.platforms,
      });

      for (const [pageIndex, url] of urls.entries()) {
        const extension = format === 'mp4' ? 'mp4' : 'png';
        const mimeType = format === 'mp4' ? 'video/mp4' : 'image/png';
        const suffix = urls.length > 1 ? `-${pageIndex + 1}` : '';
        const name = sanitizeFileName(`${design.title || contentTitle}-${design.kind}-${designIndex + 1}${suffix}.${extension}`);
        const uploaded = await this.drive.uploadFromUrl(name, url, mimeType, folderId);
        if (!uploaded?.id || !uploaded.webViewLink) {
          throw new AppError(`Drive did not return the exported Canva file ${name}.`, 502, 'DRIVE_UPLOAD_FAILED');
        }
        output.push({
          kind: design.kind,
          url: uploaded.webViewLink,
          provider: 'google-drive',
          providerId: uploaded.id,
          platforms: design.platforms,
          ...(design.kind === 'video' ? { format: '9:16' as const } : {}),
        });
      }
    }
    return output;
  }

  private async exportCanvaDesign(token: string, designId: string, format: 'png' | 'mp4'): Promise<string[]> {
    const response = await fetch('https://api.canva.com/rest/v1/exports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        design_id: designId,
        format: format === 'mp4' ? { type: 'mp4', quality: env.CANVA_VIDEO_EXPORT_QUALITY } : { type: 'png' },
      }),
    });
    if (!response.ok) throw new AppError(`Canva export failed: ${response.status} ${await response.text()}`, 502, 'CANVA_EXPORT_FAILED');
    const initial = await response.json() as { job?: CanvaJob };
    if (!initial.job?.id) throw new AppError('Canva export did not return a job ID.', 502, 'CANVA_EXPORT_FAILED');

    let job = initial.job;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (job.status === 'success') {
        const urls = job.urls ?? job.result?.urls ?? [];
        return urls.filter((url): url is string => typeof url === 'string' && url.length > 0);
      }
      if (job.status === 'failed') {
        throw new AppError(`Canva export job failed: ${JSON.stringify(job.error ?? {})}`, 502, 'CANVA_EXPORT_FAILED');
      }
      await delay(Math.min(250 + attempt * 150, 1500));
      const poll = await fetch(`https://api.canva.com/rest/v1/exports/${encodeURIComponent(initial.job.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!poll.ok) throw new AppError(`Canva export polling failed: ${poll.status} ${await poll.text()}`, 502, 'CANVA_EXPORT_FAILED');
      const body = await poll.json() as { job?: CanvaJob };
      job = body.job ?? job;
    }
    throw new AppError('Canva export timed out.', 504, 'CANVA_EXPORT_TIMEOUT');
  }
}

function validatePlatformCopy(pkg: ContentPackage, platforms: string[]) {
  for (const platform of platforms) {
    const copy = pkg.platformCopies?.[platform];
    const hasText = Boolean(
      copy?.caption?.trim()
      || copy?.description?.trim()
      || copy?.hook?.trim()
      || copy?.title?.trim(),
    );
    if (!hasText) {
      throw new AppError(`Final platform copy is missing for ${platform}. GPT intake requires finished copy; the app will not regenerate it.`, 400, 'GPT_PACKAGE_INCOMPLETE');
    }
  }
}

function validatePublishingCoverage(content: ContentItem, platforms: string[]) {
  const requiredKind: Record<string, 'image' | 'video'> = {
    facebook: 'image',
    instagram: 'image',
    pinterest: 'image',
    tiktok: 'video',
    youtube: 'video',
  };
  for (const platform of platforms) {
    const kind = requiredKind[platform];
    if (!kind) continue;
    const found = content.assets.some((asset) => {
      if (asset.kind !== kind || asset.provider === 'canva') return false;
      const targets = (asset.platforms ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
      return targets.length === 0 || targets.includes(platform);
    });
    if (!found) {
      throw new AppError(
        `${platform} is missing a publishable ${kind}. Keep the Canva source, but also provide/export a final binary for the app before review.`,
        409,
        'GPT_PACKAGE_MISSING_MEDIA',
      );
    }
  }
}

function validateProduct(input: GptProductInput) {
  if (!Array.isArray(input.deliverables) || input.deliverables.filter((value) => typeof value === 'string' && value.trim()).length === 0) {
    throw new AppError('product.deliverables must contain at least one item.', 400, 'VALIDATION_ERROR');
  }
  if (!Array.isArray(input.outline) || input.outline.filter((value) => typeof value === 'string' && value.trim()).length === 0) {
    throw new AppError('product.outline must contain at least one section.', 400, 'VALIDATION_ERROR');
  }
}

function normalizePlatforms(value: unknown): string[] {
  if (!Array.isArray(value)) throw new AppError('platforms must be a non-empty string array.', 400, 'VALIDATION_ERROR');
  const platforms = [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (platforms.length === 0) throw new AppError('platforms must be a non-empty string array.', 400, 'VALIDATION_ERROR');
  return platforms;
}

function normalizeAssets(assets: AssetRef[]): AssetRef[] {
  if (!Array.isArray(assets)) throw new AppError('content.assets must be an array.', 400, 'VALIDATION_ERROR');
  return assets.map((asset, index) => {
    if (!asset || typeof asset !== 'object') throw new AppError(`content.assets[${index}] is invalid.`, 400, 'VALIDATION_ERROR');
    if (!['image', 'carousel', 'video', 'document', 'other'].includes(asset.kind)) {
      throw new AppError(`content.assets[${index}].kind is invalid.`, 400, 'VALIDATION_ERROR');
    }
    const url = requiredString(asset.url, `content.assets[${index}].url`);
    return {
      ...asset,
      url,
      platforms: Array.isArray(asset.platforms)
        ? [...new Set(asset.platforms.map((value) => value.trim().toLowerCase()).filter(Boolean))]
        : undefined,
    };
  });
}

function normalizeCanvaDesigns(value: GptCanvaDesignInput[]): GptCanvaDesignInput[] {
  if (!Array.isArray(value)) throw new AppError('content.canvaDesigns must be an array.', 400, 'VALIDATION_ERROR');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || !['image', 'carousel', 'video'].includes(item.kind)) {
      throw new AppError(`content.canvaDesigns[${index}] is invalid.`, 400, 'VALIDATION_ERROR');
    }
    return {
      ...item,
      designId: requiredString(item.designId, `content.canvaDesigns[${index}].designId`),
      platforms: Array.isArray(item.platforms)
        ? [...new Set(item.platforms.map((platform) => platform.trim().toLowerCase()).filter(Boolean))]
        : undefined,
    };
  });
}

function dedupeAssets(assets: AssetRef[]): AssetRef[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.kind}:${asset.provider ?? ''}:${asset.providerId ?? ''}:${asset.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(`${field} is required.`, 400, 'VALIDATION_ERROR');
  return value.trim();
}

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'ghaith-web-asset';
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
