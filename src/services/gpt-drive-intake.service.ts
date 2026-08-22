import { GoogleDriveOAuthManager } from '../integrations/google-drive-oauth';
import { Store } from '../repositories/store';
import { NotificationService } from './notification.service';
import { GptPackageIntakeService, type GptPackageIntakeInput } from './gpt-package-intake.service';

const GPT_PACKAGE_PREFIX = 'Ghaith Web GPT Package —';

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
 * ChatGPT/Canva writes the finished editorial package as a Google Doc (or JSON/text file)
 * whose name starts with `Ghaith Web GPT Package —`. The existing 5-minute pipeline scans
 * Drive, parses the package, exports the referenced Canva designs, pairs every asset with its
 * platform copy, archives publishable binaries to Drive, and leaves the result IN_REVIEW.
 *
 * This keeps Canva as the editable visual library, Drive as the durable handoff/archive, and
 * Ghaith Web Content OS as the coordinator. No Gemini/OpenAI API call is made here.
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
        continue;
      }

      try {
        const raw = await this.readText(file, accessToken);
        const parsed = parseManifest(raw);
        const driveUrl = file.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`;
        const manifestAsset = {
          kind: 'document' as const,
          url: driveUrl,
          provider: 'google-drive' as const,
          providerId: file.id,
        };

        parsed.content ??= { package: {} } as GptPackageIntakeInput['content'];
        parsed.content.assets = [...(parsed.content.assets ?? []), manifestAsset];

        const result = await this.intake.ingest(parsed);
        imported.push({
          fileId: file.id,
          contentId: result.content.id,
          opportunityId: result.opportunityId,
          title: result.content.title,
        });

        await this.safeNotify({
          title: 'حزمة GPT + Canva وصلت إلى التطبيق ✅',
          body: `${result.content.title} — تم ربط كل بصرية بنص المنصة المناسب وحفظ النسخة التشغيلية في Drive.`,
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

  private async listCandidates(accessToken: string): Promise<DriveManifestFile[]> {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `name contains '${escapeDriveQuery(GPT_PACKAGE_PREFIX)}' and trashed = false`);
    url.searchParams.set('fields', 'files(id,name,mimeType,webViewLink,modifiedTime,trashed)');
    url.searchParams.set('pageSize', '25');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive GPT package scan failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { files?: DriveManifestFile[] };
    return (data.files ?? []).filter((file) => !file.trashed && isSupportedManifestMime(file.mimeType));
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

  private async safeNotify(notification: { title: string; body: string; url: string; tag: string }) {
    try { await this.notifications.send(notification); }
    catch (error) { console.warn('GPT Drive intake notification failed', error); }
  }
}

function parseManifest(raw: string): GptPackageIntakeInput {
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
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as GptPackageIntakeInput;
    } catch {
      // Try the next normalized candidate.
    }
  }
  throw new Error('GPT package manifest is not valid JSON. Keep the Drive handoff document as one JSON object only.');
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
