import { env } from '../config/env';

export interface DriveUploadResult { id: string; name: string; webViewLink?: string; }
export interface DriveConnectionProbe { ok: boolean; enabled: boolean; authMode: 'access_token' | 'oauth_refresh' | 'none'; message?: string; }

export class GoogleDriveAdapter {
  private cachedAccessToken: { value: string; expiresAt: number } | undefined;

  get authMode(): DriveConnectionProbe['authMode'] {
    if (env.GOOGLE_DRIVE_ACCESS_TOKEN) return 'access_token';
    if (env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN) return 'oauth_refresh';
    return 'none';
  }

  get enabled() { return this.authMode !== 'none'; }

  async testConnection(): Promise<DriveConnectionProbe> {
    if (!this.enabled) return { ok: false, enabled: false, authMode: 'none', message: 'Google Drive is not configured.' };
    try {
      const token = await this.getAccessToken();
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName)', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return { ok: false, enabled: true, authMode: this.authMode, message: `Google Drive returned ${response.status}.` };
      return { ok: true, enabled: true, authMode: this.authMode };
    } catch (error) {
      return { ok: false, enabled: true, authMode: this.authMode, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async uploadText(name: string, content: string, mimeType = 'text/plain'): Promise<DriveUploadResult | undefined> {
    if (!this.enabled) return undefined;

    const token = await this.getAccessToken();
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
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!response.ok) throw new Error(`Google Drive upload failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<DriveUploadResult>;
  }

  private async getAccessToken(): Promise<string> {
    if (env.GOOGLE_DRIVE_ACCESS_TOKEN) return env.GOOGLE_DRIVE_ACCESS_TOKEN;
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > Date.now() + 60_000) return this.cachedAccessToken.value;
    if (!env.GOOGLE_DRIVE_CLIENT_ID || !env.GOOGLE_DRIVE_CLIENT_SECRET || !env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      throw new Error('Google Drive OAuth refresh credentials are incomplete.');
    }

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
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('Google OAuth token response did not include access_token.');
    this.cachedAccessToken = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  }
}
