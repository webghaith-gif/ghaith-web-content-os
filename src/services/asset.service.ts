import { Store } from '../repositories/store';
import { CanvaAdapter, type CanvaDesignResult } from '../integrations/canva.adapter';
import { HeyGenAdapter } from '../integrations/heygen.adapter';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import type { AssetRef } from '../core/types';

export class AssetService {
  constructor(
    private readonly store: Store,
    private readonly canva = new CanvaAdapter(),
    private readonly heygen = new HeyGenAdapter(),
    private readonly drive = new GoogleDriveAdapter(),
  ) {}

  async requestAssets(contentId: string) {
    const content = await this.store.getContent(contentId);
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

    const design = await this.canva.requestDesign({
      contentId,
      title: content.title,
      contentType: content.contentType,
      caption: content.package.caption,
      body: content.package.description,
      cta: content.package.cta,
      imagePrompt: content.package.imagePrompt,
      videoPrompt: content.package.videoPrompt,
      script: content.package.script,
      platforms: content.platforms,
      avatarVideo,
    });

    const newAssets: AssetRef[] = [];
    const newDriveUrls: string[] = [];
    if (isCanvaDesignResult(design)) {
      const kind = design.kind === 'video' ? 'video' : design.kind === 'carousel' ? 'carousel' : 'image';
      const canvaUrl = design.editUrl || design.viewUrl;
      if (canvaUrl) newAssets.push({ kind, url: canvaUrl, provider: 'canva', providerId: design.designId });

      for (let index = 0; index < design.exportUrls.length; index += 1) {
        const ext = design.exportFormat === 'mp4' ? 'mp4' : 'png';
        const mimeType = design.exportFormat === 'mp4' ? 'video/mp4' : 'image/png';
        const suffix = design.exportUrls.length > 1 ? `-${index + 1}` : '';
        const driveFile = await this.drive.uploadFromUrl(`${content.id}-${design.kind}${suffix}.${ext}`, design.exportUrls[index]!, mimeType);
        if (driveFile?.webViewLink) {
          newDriveUrls.push(driveFile.webViewLink);
          newAssets.push({ kind, url: driveFile.webViewLink, provider: 'google-drive', providerId: driveFile.id });
        }
      }
    }

    const manifest = JSON.stringify({
      contentId,
      title: content.title,
      primaryAssetFactory: 'canva',
      design,
      optionalAvatarSource: avatarVideo,
      generatedAt: new Date().toISOString(),
    }, null, 2);
    const manifestFile = await this.drive.uploadText(`${content.id}-asset-manifest.json`, manifest, 'application/json');
    if (manifestFile?.webViewLink) newDriveUrls.push(manifestFile.webViewLink);

    return this.store.updateContent(contentId, {
      assets: [...content.assets, ...newAssets],
      googleDriveUrls: [...content.googleDriveUrls, ...newDriveUrls],
    });
  }
}

function wantsAvatar(contentType?: string, prompt?: string): boolean {
  const value = `${contentType ?? ''} ${prompt ?? ''}`.toLowerCase();
  return value.includes('avatar') || value.includes('heygen') || value.includes('talking head');
}

function isCanvaDesignResult(value: unknown): value is CanvaDesignResult {
  return Boolean(value && typeof value === 'object' && 'designId' in value && 'exportUrls' in value);
}
