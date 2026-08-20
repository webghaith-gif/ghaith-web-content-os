import { Store } from '../repositories/store';
import { CanvaAdapter, type CanvaAssetKind, type CanvaDesignResult } from '../integrations/canva.adapter';
import { HeyGenAdapter } from '../integrations/heygen.adapter';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import type { AssetRef, ContentItem } from '../core/types';

export class AssetService {
  private readonly canva: CanvaAdapter;
  private readonly heygen: HeyGenAdapter;
  private readonly drive: GoogleDriveAdapter;

  constructor(
    private readonly store: Store,
    canva?: CanvaAdapter,
    heygen?: HeyGenAdapter,
    drive?: GoogleDriveAdapter,
  ) {
    // Important: OAuth-backed integrations must share the same Store so tokens persisted
    // in Neon are available to the asset factory and can be refreshed automatically.
    this.canva = canva ?? new CanvaAdapter(store);
    this.heygen = heygen ?? new HeyGenAdapter();
    this.drive = drive ?? new GoogleDriveAdapter(store);
  }

  async requestAssets(contentId: string) {
    const content = await this.store.getContent(contentId);
    const reportFolderId = await this.reportFolderId(content);
    const needsAvatar = wantsAvatar(content.contentType, content.package.videoPrompt);

    // Canva is the primary asset factory. HeyGen is optional raw avatar/video input only.
    const avatarVideo = needsAvatar
      ? await this.heygen.requestVideo({
          contentId,
          title: content.title,
          script: content.package.script,
          prompt: content.package.videoPrompt,
        })
      : undefined;

    const requestedKinds = desiredCanvaKinds(content);
    const designs: CanvaDesignResult[] = [];
    const designErrors: Array<{ kind: CanvaAssetKind; message: string }> = [];
    for (const assetKind of requestedKinds) {
      try {
        const result = await this.canva.requestDesign({
          assetKind,
          contentId,
          title: content.title,
          hook: content.package.hook,
          contentType: content.contentType,
          caption: content.package.caption,
          body: content.package.description,
          cta: content.package.cta,
          imagePrompt: content.package.imagePrompt,
          videoPrompt: content.package.videoPrompt,
          script: content.package.script,
          carouselSlides: content.package.carouselSlides,
          videoScenes: content.package.videoScenes,
          platforms: content.platforms,
          avatarVideo,
        });
        if (isCanvaDesignResult(result)) designs.push(result);
      } catch (error) {
        designErrors.push({
          kind: assetKind,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Never report a successful asset request when Canva, our primary factory,
    // failed to produce every requested design. This also makes production
    // diagnostics actionable instead of silently returning an empty asset list.
    if (designs.length === 0 && designErrors.length > 0) {
      const summary = designErrors
        .map(({ kind, message }) => `${kind}: ${message}`)
        .join('; ')
        .slice(0, 1200);
      throw new Error(`Canva asset generation failed: ${summary}`);
    }

    const newAssets: AssetRef[] = [];
    const newDriveUrls: string[] = [];
    for (const design of designs) {
      const kind = design.kind === 'video' ? 'video' : design.kind === 'carousel' ? 'carousel' : 'image';
      const canvaUrl = design.editUrl || design.viewUrl;
      if (canvaUrl) newAssets.push({ kind, url: canvaUrl, provider: 'canva', providerId: design.designId });

      for (let index = 0; index < design.exportUrls.length; index += 1) {
        const ext = design.exportFormat === 'mp4' ? 'mp4' : 'png';
        const mimeType = design.exportFormat === 'mp4' ? 'video/mp4' : 'image/png';
        const suffix = design.exportUrls.length > 1 ? `-${index + 1}` : '';
        const driveFile = await this.drive.uploadFromUrl(
          `${content.id}-${design.kind}${suffix}.${ext}`,
          design.exportUrls[index]!,
          mimeType,
          reportFolderId,
        );
        if (driveFile?.webViewLink) {
          newDriveUrls.push(driveFile.webViewLink);
          newAssets.push({ kind, url: driveFile.webViewLink, provider: 'google-drive', providerId: driveFile.id });
        }
      }
    }

    const manifest = JSON.stringify({
      contentId,
      title: content.title,
      sourceReportId: content.sourceReportId,
      reportFolderId,
      primaryAssetFactory: 'canva',
      requestedKinds,
      designs,
      designErrors,
      optionalAvatarSource: avatarVideo,
      generatedAt: new Date().toISOString(),
    }, null, 2);
    const manifestFile = await this.drive.uploadText(
      `${content.id}-asset-manifest.json`,
      manifest,
      'application/json',
      reportFolderId,
    );
    if (manifestFile?.webViewLink) newDriveUrls.push(manifestFile.webViewLink);

    return this.store.updateContent(contentId, {
      assets: [...content.assets, ...newAssets],
      googleDriveUrls: [...new Set([...content.googleDriveUrls, ...newDriveUrls])],
    });
  }

  private async reportFolderId(content: ContentItem): Promise<string | undefined> {
    if (!content.sourceReportId) return this.drive.ensureExportFolder();
    const report = await this.store.getReport(content.sourceReportId);
    const root = await this.drive.ensureExportFolder();
    if (!root) return undefined;
    const name = report.title.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || `Report ${report.id}`;
    return this.drive.ensureChildFolder(name, root);
  }
}

function desiredCanvaKinds(content: ContentItem): CanvaAssetKind[] {
  const platforms = new Set(content.platforms.map((x) => x.toLowerCase()));
  const kinds: CanvaAssetKind[] = [];
  if ([...platforms].some((p) => ['facebook', 'instagram', 'pinterest', 'x'].includes(p))) kinds.push('social');
  if (
    Array.isArray(content.package.carouselSlides)
    && content.package.carouselSlides.length >= 2
    && [...platforms].some((p) => ['facebook', 'instagram'].includes(p))
  ) kinds.push('carousel');
  const type = (content.contentType ?? '').toLowerCase();
  if (
    [...platforms].some((p) => ['tiktok', 'youtube'].includes(p))
    || type.includes('video')
    || type.includes('reel')
    || type.includes('short')
  ) kinds.push('video');
  if (kinds.length === 0) kinds.push('social');
  return kinds;
}

function wantsAvatar(contentType?: string, prompt?: string): boolean {
  const value = `${contentType ?? ''} ${prompt ?? ''}`.toLowerCase();
  return value.includes('avatar') || value.includes('heygen') || value.includes('talking head');
}

function isCanvaDesignResult(value: unknown): value is CanvaDesignResult {
  return Boolean(value && typeof value === 'object' && 'designId' in value && 'exportUrls' in value);
}
