import { GoogleDriveAdapter, type DriveChangedFile } from '../integrations/google-drive.adapter';
import { GoogleDriveOAuthManager } from '../integrations/google-drive-oauth';
import { Store } from '../repositories/store';
import { NotificationService } from './notification.service';

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
  private readonly notifications: NotificationService;

  constructor(private readonly store: Store) {
    this.drive = new GoogleDriveAdapter(store);
    this.oauth = new GoogleDriveOAuthManager(store);
    this.notifications = new NotificationService(store);
  }

  async importPendingChanges() {
    const changedFiles = await this.drive.consumeChanges();
    if (!changedFiles.length) return { ok: true, scanned: 0, imported: [], ignored: [] };

    const rootFolderId = await this.drive.ensureExportFolder();
    if (!rootFolderId) throw new Error('Google Drive export folder is unavailable.');
    const accessToken = await this.oauth.getAccessToken();
    if (!accessToken) throw new Error('Google Drive is not authorized.');

    const existingReports = await this.store.listReports();
    const imported: Array<{ reportId: string; fileId: string; title: string }> = [];
    const ignored: Array<{ fileId: string; reason: string }> = [];

    for (const changed of changedFiles) {
      if (!isSupportedReportMime(changed.mimeType)) {
        ignored.push({ fileId: changed.id, reason: 'unsupported_mime' });
        continue;
      }

      const metadata = await this.getMetadata(changed.id, accessToken);
      if (!metadata || metadata.trashed) {
        ignored.push({ fileId: changed.id, reason: 'missing_or_trashed' });
        continue;
      }

      // Only direct children of the Runtime Exports root are treated as incoming reports.
      // Generated assets/products live in child folders and must never loop back as reports.
      if (!metadata.parents?.includes(rootFolderId)) {
        ignored.push({ fileId: changed.id, reason: 'not_root_report' });
        continue;
      }

      const driveUrl = metadata.webViewLink ?? changed.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(changed.id)}`;
      if (existingReports.some((report) => report.googleDriveUrl?.includes(changed.id))) {
        ignored.push({ fileId: changed.id, reason: 'already_imported' });
        continue;
      }

      const body = (await this.readText(metadata, accessToken)).trim();
      if (body.length < 80) {
        ignored.push({ fileId: changed.id, reason: 'too_short' });
        continue;
      }

      const title = cleanTitle(metadata.name ?? changed.name);
      const report = await this.store.createReport({
        title,
        body,
        source: 'Google Drive Inbox',
        googleDriveUrl: driveUrl,
        googleDriveFolderUrl: this.drive.folderUrl(rootFolderId),
        automation: { version: 1 },
      });

      imported.push({ reportId: report.id, fileId: changed.id, title: report.title });
      existingReports.push(report);
      await this.safeNotify({
        title: 'تقرير جديد دخل Ghaith Web Content OS 📥',
        body: `${report.title} — بدأ مسار التحليل الآلي، وستصلك إشعارات المراحل التالية.`,
        url: '/browser.html?view=reports',
        tag: `drive-report-${report.id}`,
      });
    }

    return { ok: true, scanned: changedFiles.length, imported, ignored };
  }

  private async getMetadata(fileId: string, accessToken: string): Promise<DriveFileMetadata | undefined> {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set('fields', 'id,name,mimeType,parents,webViewLink,trashed');
    url.searchParams.set('supportsAllDrives', 'true');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Google Drive metadata read failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<DriveFileMetadata>;
  }

  private async readText(file: DriveFileMetadata, accessToken: string): Promise<string> {
    const nativeDoc = file.mimeType === 'application/vnd.google-apps.document';
    const url = nativeDoc
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fplain`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
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
