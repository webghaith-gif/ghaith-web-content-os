import { env } from '../config/env';

export interface DriveUploadResult { id: string; name: string; webViewLink?: string; }

export class GoogleDriveAdapter {
  get enabled() { return Boolean(env.GOOGLE_DRIVE_ACCESS_TOKEN); }

  async uploadText(name: string, content: string, mimeType = 'text/plain'): Promise<DriveUploadResult | undefined> {
    if (!env.GOOGLE_DRIVE_ACCESS_TOKEN) return undefined;

    const boundary = `ghaith-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name,
      ...(env.GOOGLE_DRIVE_FOLDER_ID ? { parents: [env.GOOGLE_DRIVE_FOLDER_ID] } : {}),
    });
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`,
      `--${boundary}--`,
    ].join('');

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GOOGLE_DRIVE_ACCESS_TOKEN}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!response.ok) throw new Error(`Google Drive upload failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<DriveUploadResult>;
  }
}
