import type { Store } from '../repositories/store';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';
import type { Report } from '../core/types';

export class ReportArchiveService {
  private readonly drive: GoogleDriveAdapter;

  constructor(private readonly store: Store, drive?: GoogleDriveAdapter) {
    this.drive = drive ?? new GoogleDriveAdapter(store);
  }

  async archive(reportId: string) {
    const report = await this.store.getReport(reportId);
    const root = await this.drive.ensureExportFolder();
    if (!root) throw new Error('Google Drive is not connected.');
    const folderName = sanitize(report.title) || `Report ${report.id}`;
    const folderId = await this.drive.ensureChildFolder(folderName, root);
    const file = await this.drive.upsertText('التقرير الكامل.md', renderReport(report), 'text/markdown; charset=utf-8', folderId);
    if (!file?.webViewLink) throw new Error('Google Drive did not return a report link.');
    return this.store.updateReport(report.id, {
      googleDriveUrl: file.webViewLink,
      googleDriveFolderUrl: this.drive.folderUrl(folderId),
    });
  }

  async archivePending(limit = 5) {
    const reports = await this.store.listReports();
    const pending = reports.filter((report) => !report.googleDriveUrl).slice(0, Math.max(1, Math.min(10, limit)));
    const archived: Report[] = [];
    for (const report of pending) archived.push(await this.archive(report.id));
    return { archived, remaining: Math.max(0, reports.filter((report) => !report.googleDriveUrl).length - archived.length) };
  }
}

function renderReport(report: Report) {
  return [
    `# ${report.title}`,
    '',
    `**التاريخ:** ${report.createdAt}`,
    report.source ? `**المصدر:** ${report.source}` : '',
    '',
    '---',
    '',
    report.body,
    '',
  ].filter((line, index, values) => line !== '' || values[index - 1] !== '').join('\n');
}

function sanitize(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}
