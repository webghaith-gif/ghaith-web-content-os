import { Store } from '../repositories/store';
import { CanvaAdapter, type CanvaAssetKind, type CanvaDesignResult } from '../integrations/canva.adapter';
import { HeyGenAdapter } from '../integrations/heygen.adapter';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import { RemotionAdapter } from '../integrations/remotion.adapter';
import { renderFallbackMedia } from './fallback-media-renderer';
import type { AssetRef, ContentItem } from '../core/types';

export class AssetService {
  private readonly canva: CanvaAdapter;
  private readonly heygen: HeyGenAdapter;
  private readonly drive: GoogleDriveAdapter;
  private readonly remotion: RemotionAdapter;

  constructor(
    private readonly store: Store,
    canva?: CanvaAdapter,
    heygen?: HeyGenAdapter,
    drive?: GoogleDriveAdapter,
    remotion?: RemotionAdapter,
  ) {
    this.canva = canva ?? new CanvaAdapter(store);
    this.heygen = heygen ?? new HeyGenAdapter();
    this.drive = drive ?? new GoogleDriveAdapter(store);
    this.remotion = remotion ?? new RemotionAdapter();
  }

  async requestAssets(contentId: string) {
    const content = await this.store.getContent(contentId);
    const reportFolderId = await this.reportFolderId(content);
    const needsAvatar = wantsAvatar(content.contentType, content.package.videoPrompt);

    const avatarVideo = needsAvatar
      ? await this.heygen.requestVideo({
          contentId,
          title: content.title,
          script: content.package.script,
          prompt: content.package.videoPrompt,
        }).catch(() => undefined)
      : undefined;

    const requestedKinds = desiredCanvaKinds(content);
    const canvaKinds = requestedKinds.filter((kind) => kind !== 'video');
    const designs: CanvaDesignResult[] = [];
    const designErrors: Array<{ kind: CanvaAssetKind; message: string }> = [];
    for (const assetKind of canvaKinds) {
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

    const remotionFiles: Array<{ format: string; ratio: string; url: string; width: number; height: number; platforms: string[] }> = [];
    const remotionErrors: Array<{ format: string; message: string }> = [];
    if (requestedKinds.includes('video')) {
      try {
        const batch = await this.remotion.renderVideos(content);
        remotionErrors.push(...batch.errors);
        for (const video of batch.videos) {
          const file = await this.drive.upsertBytes(`${content.id}-video-remotion-${video.format}-${video.width}x${video.height}.mp4`, video.bytes, 'video/mp4', reportFolderId);
          if (!file?.webViewLink) {
            remotionErrors.push({ format: video.format, message: 'Google Drive did not return a link for the rendered video.' });
            continue;
          }
          remotionFiles.push({ format: video.format, ratio: video.ratio, url: file.webViewLink, width: video.width, height: video.height, platforms: video.platforms });
          newDriveUrls.push(file.webViewLink);
          newAssets.push({ kind: 'video', url: file.webViewLink, provider: 'remotion', providerId: file.id, format: video.ratio, width: video.width, height: video.height, platforms: video.platforms });
        }
      } catch (error) {
        remotionErrors.push({ format: 'batch', message: error instanceof Error ? error.message : String(error) });
      }
    }

    const succeededKinds = new Set<CanvaAssetKind>(designs.map((design) => design.kind));
    if (remotionFiles.length) succeededKinds.add('video');
    const missingKinds = requestedKinds.filter((kind) => !succeededKinds.has(kind));
    const fallbackFiles: string[] = [];

    if (missingKinds.some((kind) => kind !== 'video')) {
      const fallback = await renderFallbackMedia(content);

      if (missingKinds.includes('social') && fallback.social) {
        const file = await this.drive.upsertBytes(`${content.id}-social-fallback.png`, fallback.social, 'image/png', reportFolderId);
        if (file?.webViewLink) {
          fallbackFiles.push(file.webViewLink);
          newDriveUrls.push(file.webViewLink);
          newAssets.push({ kind: 'image', url: file.webViewLink, provider: 'google-drive', providerId: file.id });
        }
      }

      if (missingKinds.includes('carousel')) {
        for (let index = 0; index < fallback.carouselSlides.length; index += 1) {
          const file = await this.drive.upsertBytes(
            `${content.id}-carousel-${String(index + 1).padStart(2, '0')}.png`,
            fallback.carouselSlides[index]!,
            'image/png',
            reportFolderId,
          );
          if (file?.webViewLink) {
            fallbackFiles.push(file.webViewLink);
            newDriveUrls.push(file.webViewLink);
            newAssets.push({ kind: 'carousel', url: file.webViewLink, provider: 'google-drive', providerId: file.id });
          }
        }
        if (fallback.carouselPdf) {
          const pdf = await this.drive.upsertBytes(`${content.id}-carousel.pdf`, fallback.carouselPdf, 'application/pdf', reportFolderId);
          if (pdf?.webViewLink) {
            fallbackFiles.push(pdf.webViewLink);
            newDriveUrls.push(pdf.webViewLink);
            newAssets.push({ kind: 'carousel', url: pdf.webViewLink, provider: 'google-drive', providerId: pdf.id });
          }
        }
      }

    }

    const manifest = JSON.stringify({
      contentId,
      title: content.title,
      sourceReportId: content.sourceReportId,
      reportFolderId,
      requestedKinds,
      canvaDesigns: designs,
      canvaErrors: designErrors,
      remotion: { attempted: requestedKinds.includes('video'), files: remotionFiles, errors: remotionErrors },
      missingKinds,
      fallbackUsedFor: missingKinds.filter((kind) => kind !== 'video'),
      fallbackFiles,
      optionalAvatarSource: avatarVideo,
      generatedAt: new Date().toISOString(),
    }, null, 2);
    const manifestFile = await this.drive.upsertText(
      `${content.id}-asset-manifest.json`,
      manifest,
      'application/json',
      reportFolderId,
    );
    if (manifestFile?.webViewLink) newDriveUrls.push(manifestFile.webViewLink);

    return this.store.updateContent(contentId, {
      assets: dedupeAssets([...content.assets, ...newAssets]),
      googleDriveUrls: [...new Set([...content.googleDriveUrls, ...newDriveUrls])],
    });
  }

  async ingestHeyGenVideo(input: { contentId: string; videoUrl: string; videoId?: string }) {
    const content = await this.store.getContent(input.contentId);
    const url = new URL(input.videoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HeyGen video URL must use HTTP or HTTPS.');
    const reportFolderId = await this.reportFolderId(content);
    const file = await this.drive.uploadFromUrl(
      `${content.id}-video-heygen.mp4`,
      input.videoUrl,
      'video/mp4',
      reportFolderId,
    );
    if (!file?.webViewLink) throw new Error('Google Drive did not return a link for the HeyGen video.');
    return this.store.updateContent(content.id, {
      assets: dedupeAssets([...content.assets, {
        kind: 'video',
        url: file.webViewLink,
        provider: 'heygen',
        providerId: input.videoId || file.id,
      }]),
      googleDriveUrls: [...new Set([...content.googleDriveUrls, file.webViewLink])],
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

function dedupeAssets(values: AssetRef[]) {
  const seen = new Set<string>();
  return values.filter((asset) => {
    const key = `${asset.provider ?? ''}:${asset.providerId ?? ''}:${asset.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
