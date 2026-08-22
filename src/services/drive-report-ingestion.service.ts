import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import { GoogleDriveOAuthManager } from '../integrations/google-drive-oauth';
import { Store } from '../repositories/store';
import { GptDriveIntakeService } from './gpt-drive-intake.service';
import { NotificationService } from './notification.service';

const INTAKE_NAME = 'Ghaith Web — Incoming Report';

interface DriveFileMetadata {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  webViewLink?: string;
  trashed?: boolean;
}

export class DriveReportIngestionService {
  private readonly drive: GoogleDriveAdapter;
  private readonly oauth: GoogleDriveOAuthManager;
  private readonly gptPackages: GptDriveIntakeService;
  private readonly notifications: NotificationService;

  constructor(private readonly store: Store) {
    this.drive = new GoogleDriveAdapter(store);
    this.oauth = new GoogleDriveOAuthManager(store);
    this.gptPackages = new GptDriveIntakeService(store);
    this.notifications = new NotificationService(store);
  }

  async ensureIntakeDocument() {
    const rootFolderId = await this.drive.ensureExportFolder();
    if (!rootFolderId) throw new Error('Google Drive export folder is unavailable.');
    const accessToken = await this.oauth.getAccessToken();
    if (!accessToken) throw new Error('Google Drive is not authorized.');

    const escapedName = escapeDriveQuery(INTAKE_NAME);
    const escapedParent = escapeDriveQuery(rootFolderId);
    const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
    listUrl.searchParams.set('q', `name = '${escapedName}' and '${escapedParent}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`);
    listUrl.searchParams.set('fields', 'files(id,name,mimeType,parents,webViewLink,trashed)');
    listUrl.searchParams.set('pageSize', '10');
    const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listResponse.ok) throw new Error(`Google Drive intake lookup failed: ${listResponse.status} ${await listResponse.text()}`);
    const listed = await listResponse.json() as { files?: DriveFileMetadata[] };
    const existing = listed.files?.find((file) => file.id && !file.trashed);
    if (existing?.id) {
      return { ok: true, created: false, file: existing, folderId: rootFolderId };
    }

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: INTAKE_NAME,
        mimeType: 'application/vnd.google-apps.document',
        parents: [rootFolderId],
      }),
    });
    if (!createResponse.ok) throw new Error(`Google Drive intake creation failed: ${createResponse.status} ${await createResponse.text()}`);
    const created = await createResponse.json() as DriveFileMetadata;
    return { ok: true, created: true, file: created, folderId: rootFolderId };
  }

  async importPendingChanges() {
    const rootFolderId = await this.drive.ensureExportFolder();
    if (!rootFolderId) throw new Error('Google Drive export folder is unavailable.');
    const accessToken = await this.oauth.getAccessToken();
    if (!accessToken) throw new Error('Google Drive is not authorized.');

    try { await this.drive.consumeChanges(); }
    catch (error) { console.warn('Drive change cursor refresh failed; direct inbox scan will continue', error); }

    const candidates = await this.listRootReportFiles(rootFolderId, accessToken);
    const existingReports = await this.store.listReports();
    const imported: Array<{ reportId: string; fileId: string; title: string }> = [];
    const ignored: Array<{ fileId: string; reason: string }> = [];

    for (const metadata of candidates) {
      if (!isSupportedReportMime(metadata.mimeType)) {
        ignored.push({ fileId: metadata.id, reason: 'unsupported_mime' });
        continue;
      }

      if (metadata.name === INTAKE_NAME) {
        ignored.push({ fileId: metadata.id, reason: 'intake_not_named_yet' });
        continue;
      }

      if (existingReports.some((report) => report.googleDriveUrl?.includes(metadata.id))) {
        ignored.push({ fileId: metadata.id, reason: 'already_imported' });
        continue;
      }

      const body = (await this.readText(metadata, accessToken)).trim();
      if (body.length < 80) {
        ignored.push({ fileId: metadata.id, reason: 'too_short' });
        continue;
      }

      const driveUrl = metadata.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(metadata.id)}`;
      const title = cleanTitle(metadata.name ?? 'تقرير جديد');
      const report = await this.store.createReport({
        title,
        body,
        source: 'Google Drive Inbox',
        googleDriveUrl: driveUrl,
        googleDriveFolderUrl: this.drive.folderUrl(rootFolderId),
        automation: { version: 1 },
      });

      imported.push({ reportId: report.id, fileId: metadata.id, title: report.title });
      existingReports.push(report);
      await this.safeNotify({
        title: 'تقرير جديد دخل Ghaith Web Content OS 📥',
        body: `${report.title} — بدأ مسار التحليل الآلي، وستصلك إشعارات المراحل التالية.`,
        url: '/browser.html?view=reports',
        tag: `drive-report-${report.id}`,
      });
    }

    let gptPackages: unknown;
    try {
      gptPackages = await this.gptPackages.importPendingPackages();
    } catch (error) {
      gptPackages = { ok: false, message: error instanceof Error ? error.message : String(error) };
      console.warn('GPT package Drive intake deferred', error);
    }

    return { ok: true, scanned: candidates.length, imported, ignored, gptPackages };
  }

  private async listRootReportFiles(rootFolderId: string, accessToken: string): Promise<DriveFileMetadata[]> {
    const escapedParent = escapeDriveQuery(rootFolderId);
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${escapedParent}' in parents and trashed = false`);
    url.searchParams.set('fields', 'files(id,name,mimeType,parents,webViewLink,trashed)');
    url.searchParams.set('pageSize', '50');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive inbox scan failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { files?: DriveFileMetadata[] };
    return (data.files ?? []).filter((file) => !file.trashed && isSupportedReportMime(file.mimeType));
  }

  private async readText(file: DriveFileMetadata, accessToken: string): Promise<string> {
    const nativeDoc = file.mimeType === 'application/vnd.google-apps.document';
    const url = nativeDoc
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fplain`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive report read failed: ${response.status} ${await response.text()}`);
    return (await response.text()).replace(/^\uFEFF/, '');
  }

  private async safeNotify(notification: { title: string; body: string; url: string; tag: string }) {
    try { await this.notifications.send(notification); }
    catch (error) { console.warn('Drive report ingestion notification failed', error); }
  }
}

function isSupportedReportMime(mimeType?: string) {
  return mimeType === 'application/vnd.google-apps.document'
    || mimeType === 'text/plain'
    || mimeType === 'text/markdown';
}

function cleanTitle(name: string) {
  return String(name || 'تقرير جديد').replace(/\.(txt|md)$/i, '').trim().slice(0, 180) || 'تقرير جديد';
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
