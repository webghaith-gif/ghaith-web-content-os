import { GoogleDriveOAuthManager } from '../integrations/google-drive-oauth';
import { Store } from '../repositories/store';
import { NotificationService } from './notification.service';
import { GptPackageIntakeService, type GptPackageIntakeInput } from './gpt-package-intake.service';

const GPT_PACKAGE_PREFIX = 'Ghaith Web GPT Package —';
const PROCESSED_MARKER = '[PROCESSED]';

type GptDriveManifest = GptPackageIntakeInput & {
  reportId?: string;
  /** Preview packages are GPT-authored text/product drafts only. No Canva/final-media gate is crossed. */
  previewOnly?: boolean;
  /** Use "none" only when GPT deliberately concludes that the selected opportunity should not create a product. */
  productDecision?: 'draft' | 'none';
};

interface DriveManifestFile {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  trashed?: boolean;
}

/**
 * Zero-API-cost bridge for ChatGPT-authored packages.
 *
 * ChatGPT writes a Google Doc (or JSON/text file) whose name starts with
 * `Ghaith Web GPT Package —`. A previewOnly manifest is persisted as a DRAFT in Neon
 * without Canva export, runtime-Drive archive, READY, ClickUp, Make, or publishing.
 * After explicit user approval, a later final manifest may include Canva/final assets and
 * the existing GptPackageIntakeService resumes the normal IN_REVIEW pipeline.
 *
 * The manifest may provide opportunityId directly, or only reportId. In the latter case the
 * package waits safely until report analysis has selected its strongest opportunity, then resumes.
 * Successfully consumed files receive a durable [PROCESSED] suffix in Drive.
 */
export class GptDriveIntakeService {
  private readonly oauth: GoogleDriveOAuthManager;
  private readonly intake: GptPackageIntakeService;
  private readonly notifications: NotificationService;

  constructor(private readonly store: Store) {
    this.oauth = new GoogleDriveOAuthManager(store);
    this.intake = new GptPackageIntakeService(store);
    this.notifications = new NotificationService(store);
  }

  async importPendingPackages() {
    const accessToken = await this.oauth.getAccessToken();
    if (!accessToken) throw new Error('Google Drive is not authorized.');

    const candidates = await this.listCandidates(accessToken);
    const contents = await this.store.listContents();
    const imported: Array<{ fileId: string; contentId: string; opportunityId: string; title: string }> = [];
    const ignored: Array<{ fileId: string; reason: string }> = [];
    const failed: Array<{ fileId: string; reason: string }> = [];

    for (const file of candidates) {
      if (contents.some((content) => content.assets.some((asset) => asset.provider === 'google-drive' && asset.providerId === file.id))) {
        ignored.push({ fileId: file.id, reason: 'already_imported' });
        await this.markProcessed(file, accessToken).catch((error) => console.warn(`Could not mark GPT package ${file.id} processed`, error));
        continue;
      }

      try {
        const raw = await this.readText(file, accessToken);
        const parsed = parseManifest(raw);
        await this.resolveOpportunity(parsed);

        const driveUrl = file.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`;
        const manifestAsset = {
          kind: 'document' as const,
          url: driveUrl,
          provider: 'google-drive' as const,
          providerId: file.id,
        };

        parsed.content ??= { package: {} } as GptPackageIntakeInput['content'];
        parsed.content.assets = [...(parsed.content.assets ?? []), manifestAsset];

        const result = parsed.previewOnly
          ? await this.ingestPreview(parsed)
          : await this.intake.ingest(parsed);

        if (!parsed.product && parsed.productDecision === 'none') {
          const now = new Date().toISOString();
          await this.store.patchReportAutomation(result.reportId, {
            productSkippedAt: now,
            productReadyForReviewAt: now,
            lastError: undefined,
            lastErrorAt: undefined,
          });
        }

        imported.push({
          fileId: file.id,
          contentId: result.content.id,
          opportunityId: result.opportunityId,
          title: result.content.title,
        });

        await this.markProcessed(file, accessToken).catch((error) => console.warn(`Could not mark GPT package ${file.id} processed`, error));

        await this.safeNotify(parsed.previewOnly ? {
          title: 'حزمة GPT جاهزة للمعاينة ✍️',
          body: `${result.content.title} — حُفظت كمسودة DRAFT فقط؛ لم تُرسل إلى Canva أو READY أو النشر.`,
          url: `/browser.html?view=content&content=${encodeURIComponent(result.content.id)}`,
          tag: `gpt-drive-preview-${file.id}`,
        } : {
          title: 'حزمة GPT + Canva وصلت إلى التطبيق ✅',
          body: parsed.productDecision === 'none' && !parsed.product
            ? `${result.content.title} — تم ربط البصريات بالنصوص وحفظها في Drive؛ لا يوجد منتج لهذه الفرصة بقرار GPT.`
            : `${result.content.title} — تم ربط كل بصرية بنص المنصة المناسب وحفظ النسخة التشغيلية في Drive.`,
          url: '/browser.html?view=content',
          tag: `gpt-drive-intake-${file.id}`,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failed.push({ fileId: file.id, reason });
        console.warn(`GPT Drive package ${file.id} deferred`, error);
      }
    }

    return { ok: failed.length === 0, scanned: candidates.length, imported, ignored, failed };
  }

  /**
   * Persist the editorial package before visual approval. This is deliberately separate from
   * GptPackageIntakeService because that service represents the post-approval/final-media gate.
   */
  private async ingestPreview(manifest: GptDriveManifest) {
    const opportunityId = requiredText(manifest.opportunityId, 'opportunityId');
    const opportunity = await this.store.getOpportunity(opportunityId);
    const report = await this.store.getReport(opportunity.reportId);
    const contentInput = manifest.content;
    if (!contentInput?.package || typeof contentInput.package !== 'object') {
      throw new Error('content.package is required for a GPT preview.');
    }

    const platforms = normalizePreviewPlatforms(manifest.platforms);
    const allContents = await this.store.listContents();
    const current = allContents.find((item) => item.opportunityId === opportunityId && item.status !== 'ARCHIVED' && item.status !== 'PUBLISHED');
    if (current && !['DRAFT', 'IN_PROGRESS'].includes(current.status)) {
      throw new Error(`Content ${current.id} is already ${current.status}; a preview package cannot downgrade it.`);
    }
    const published = allContents.find((item) => item.opportunityId === opportunityId && item.status === 'PUBLISHED');
    if (published) throw new Error('A published package already exists for this opportunity.');

    const assets = dedupeDocumentAssets([
      ...(current?.assets ?? []).filter((asset) => asset.kind === 'document'),
      ...(contentInput.assets ?? []).filter((asset) => asset.kind === 'document'),
    ]);
    const patch = {
      title: cleanText(contentInput.title) || opportunity.title,
      topic: cleanText(contentInput.topic) || opportunity.title,
      sourceReportId: report.id,
      opportunityId,
      targetAudience: cleanText(contentInput.targetAudience),
      objective: cleanText(contentInput.objective) || 'GPT-authored preview package awaiting explicit visual approval.',
      platforms,
      contentType: 'gpt-curated-multi-platform-package',
      package: contentInput.package,
      assets,
      status: 'DRAFT' as const,
    };

    const content = current
      ? await this.store.updateContent(current.id, {
          ...patch,
          googleDriveUrls: current.googleDriveUrls ?? [],
          revision: current.revision + 1,
        })
      : await this.store.createContent({ ...patch, googleDriveUrls: [] });

    const now = new Date().toISOString();
    await this.store.patchReportAutomation(report.id, {
      opportunityId,
      opportunitiesReadyAt: report.automation?.opportunitiesReadyAt ?? now,
      contentId: content.id,
      contentReadyAt: report.automation?.contentReadyAt ?? now,
      lastError: undefined,
      lastErrorAt: undefined,
    });

    let product;
    if (manifest.product) {
      const input = manifest.product;
      const title = requiredText(input.title, 'product.title');
      const productType = requiredText(input.productType, 'product.productType');
      const targetAudience = requiredText(input.targetAudience, 'product.targetAudience');
      const problem = requiredText(input.problem, 'product.problem');
      const promise = requiredText(input.promise, 'product.promise');
      const draftBody = requiredText(input.draftBody, 'product.draftBody');
      const deliverables = stringList(input.deliverables);
      const outline = stringList(input.outline);
      if (!deliverables.length || !outline.length) throw new Error('Product preview requires deliverables and outline.');

      const products = await this.store.listProducts();
      const existing = products.find((item) => item.opportunityId === opportunityId && item.status !== 'ARCHIVED');
      const productPatch = {
        reportId: report.id,
        opportunityId,
        title,
        productType,
        targetAudience,
        problem,
        promise,
        deliverables,
        outline,
        draftBody,
        coverPrompt: cleanText(input.coverPrompt),
        qualityReview: input.qualityReview,
        status: 'IN_REVIEW' as const,
      };
      product = existing
        ? await this.store.updateProduct(existing.id, productPatch)
        : (await this.store.createProduct(productPatch)).product;
      await this.store.patchReportAutomation(report.id, {
        productId: product.id,
        productReadyForReviewAt: now,
      });
    }

    return {
      ok: true,
      source: 'gpt-content-pro-preview',
      reportId: report.id,
      opportunityId,
      content,
      product,
      message: 'GPT preview saved as DRAFT without crossing the visual approval or publishing gates.',
    };
  }

  private async resolveOpportunity(manifest: GptDriveManifest) {
    if (typeof manifest.opportunityId === 'string' && manifest.opportunityId.trim()) return;
    const reportId = typeof manifest.reportId === 'string' ? manifest.reportId.trim() : '';
    if (!reportId) {
      throw new Error('GPT package must contain opportunityId or reportId.');
    }

    const report = await this.store.getReport(reportId);
    if (report.automation?.opportunityId) {
      manifest.opportunityId = report.automation.opportunityId;
      return;
    }

    const opportunities = (await this.store.listOpportunities()).filter((item) => item.reportId === reportId);
    const selected = [...opportunities].sort((a, b) => b.score.total - a.score.total)[0];
    if (!selected) {
      throw new Error(`Report ${reportId} is waiting for opportunity extraction; GPT package will retry automatically.`);
    }
    manifest.opportunityId = selected.id;
  }

  private async listCandidates(accessToken: string): Promise<DriveManifestFile[]> {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `name contains '${escapeDriveQuery(GPT_PACKAGE_PREFIX)}' and trashed = false`);
    url.searchParams.set('fields', 'files(id,name,mimeType,webViewLink,modifiedTime,trashed)');
    url.searchParams.set('pageSize', '25');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive GPT package scan failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { files?: DriveManifestFile[] };
    return (data.files ?? []).filter((file) =>
      !file.trashed
      && isSupportedManifestMime(file.mimeType)
      && !String(file.name ?? '').includes(PROCESSED_MARKER)
    );
  }

  private async readText(file: DriveManifestFile, accessToken: string): Promise<string> {
    const nativeDoc = file.mimeType === 'application/vnd.google-apps.document';
    const url = nativeDoc
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fplain`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive GPT package read failed: ${response.status} ${await response.text()}`);
    return (await response.text()).replace(/^\uFEFF/, '').trim();
  }

  private async markProcessed(file: DriveManifestFile, accessToken: string) {
    const name = String(file.name ?? '').trim();
    if (!name || name.includes(PROCESSED_MARKER)) return;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?fields=id,name`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${name} ${PROCESSED_MARKER}` }),
    });
    if (!response.ok) throw new Error(`Google Drive GPT package processed marker failed: ${response.status} ${await response.text()}`);
  }

  private async safeNotify(notification: { title: string; body: string; url: string; tag: string }) {
    try { await this.notifications.send(notification); }
    catch (error) { console.warn('GPT Drive intake notification failed', error); }
  }
}

function parseManifest(raw: string): GptDriveManifest {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const candidates = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as GptDriveManifest;
    } catch {
      // Try the next normalized candidate.
    }
  }
  throw new Error('GPT package manifest is not valid JSON. Keep the Drive handoff document as one JSON object only.');
}

function normalizePreviewPlatforms(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('platforms must be a non-empty string array.');
  const platforms = [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (!platforms.length) throw new Error('platforms must be a non-empty string array.');
  return platforms;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function dedupeDocumentAssets<T extends { kind: string; url: string; provider?: string; providerId?: string }>(assets: T[]): T[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.kind}:${asset.provider ?? ''}:${asset.providerId ?? ''}:${asset.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSupportedManifestMime(mimeType?: string) {
  return mimeType === 'application/vnd.google-apps.document'
    || mimeType === 'application/json'
    || mimeType === 'text/plain'
    || mimeType === 'text/markdown';
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
