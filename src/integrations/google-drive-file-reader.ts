import { env } from '../config/env';
import type { Store } from '../repositories/store';
import { GoogleDriveOAuthManager } from './google-drive-oauth';

export interface GoogleDriveBinaryFile {
  bytes: Uint8Array;
  mimeType: string;
  name?: string;
}

export class GoogleDriveFileReader {
  private readonly oauth?: GoogleDriveOAuthManager;

  constructor(store?: Store) {
    this.oauth = store ? new GoogleDriveOAuthManager(store) : undefined;
  }

  async download(fileId: string): Promise<GoogleDriveBinaryFile> {
    const token = await this.getAccessToken();
    if (!token) throw new Error('Google Drive is not authorized for asset download.');

    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metadataResponse.ok) {
      throw new Error(`Google Drive metadata download failed (${metadataResponse.status}): ${await metadataResponse.text()}`);
    }
    const metadata = await metadataResponse.json() as { name?: string; mimeType?: string };
    if (metadata.mimeType?.startsWith('application/vnd.google-apps.')) {
      throw new Error(`Google Drive native file ${fileId} cannot be used as a binary publishing asset.`);
    }

    const mediaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!mediaResponse.ok) {
      throw new Error(`Google Drive media download failed (${mediaResponse.status}): ${await mediaResponse.text()}`);
    }

    return {
      bytes: new Uint8Array(await mediaResponse.arrayBuffer()),
      mimeType: metadata.mimeType || mediaResponse.headers.get('content-type') || 'application/octet-stream',
      name: metadata.name,
    };
  }

  private async getAccessToken(): Promise<string | undefined> {
    if (env.GOOGLE_DRIVE_ACCESS_TOKEN) return env.GOOGLE_DRIVE_ACCESS_TOKEN;
    if (this.oauth) return this.oauth.getAccessToken();
    if (!env.GOOGLE_DRIVE_CLIENT_ID || !env.GOOGLE_DRIVE_CLIENT_SECRET || !env.GOOGLE_DRIVE_REFRESH_TOKEN) return undefined;

    const body = new URLSearchParams({
      client_id: env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error(`Google OAuth token refresh failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { access_token?: string };
    if (!data.access_token) throw new Error('Google OAuth token response did not include access_token.');
    return data.access_token;
  }
}
