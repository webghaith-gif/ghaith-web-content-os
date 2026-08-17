import { Store } from '../repositories/store';
import { CanvaAdapter } from '../integrations/canva.adapter';
import { HeyGenAdapter } from '../integrations/heygen.adapter';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';

export class AssetService {
  constructor(
    private readonly store: Store,
    private readonly canva = new CanvaAdapter(),
    private readonly heygen = new HeyGenAdapter(),
    private readonly drive = new GoogleDriveAdapter(),
  ) {}

  async requestAssets(contentId: string) {
    const content = await this.store.getContent(contentId);
    const [design, video] = await Promise.all([
      this.canva.requestDesign({ contentId, title: content.title, prompt: content.package.imagePrompt, platforms: content.platforms }),
      this.heygen.requestVideo({ contentId, title: content.title, script: content.package.script, prompt: content.package.videoPrompt }),
    ]);
    const manifest = JSON.stringify({ contentId, title: content.title, design, video }, null, 2);
    const driveFile = await this.drive.uploadText(`${content.id}-asset-manifest.json`, manifest, 'application/json');
    const driveUrls = [...content.googleDriveUrls, ...(driveFile?.webViewLink ? [driveFile.webViewLink] : [])];
    return this.store.updateContent(contentId, { googleDriveUrls: driveUrls });
  }
}
