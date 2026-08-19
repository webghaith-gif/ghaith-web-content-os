import { env } from '../config/env';
import type { Store } from '../repositories/store';
import { GoogleDriveOAuthManager } from './google-drive-oauth';

export interface DriveUploadResult { id: string; name: string; webViewLink?: string; }
export interface DriveConnectionProbe {
  ok: boolean;
  enabled: boolean;
  connected: boolean;
  authMode: 'access_token' | 'oauth_refresh_env' | 'oauth' | 'oauth_pending' | 'none';
  folderId?: string | null;
  folderName?: string;
  message?: string;
}

export class GoogleDriveAdapter {
  private readonly oauth?: GoogleDriveOAuthManager;

  constructor(private readonly store?: Store) {
    this.oauth = store ? new GoogleDriveOAuthManager(store) : undefined;
  }

  get configured() {
    return Boolean(
      env.GOOGLE_DRIVE_ACCESS_TOKEN
      || (env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && (env.GOOGLE_DRIVE_REFRESH_TOKEN || this.oauth)),
    );
  }

  async oauthStatus(): Promise<DriveConnectionProbe> {
    if (this.oauth) {
      const status = await this.oauth.status();
      return {
        ok: status.connected,
        enabled: status.configured || Boolean(env.GOOGLE_DRIVE_ACCESS_TOKEN || env.GOOGLE_DRIVE_REFRESH_TOKEN),
        connected: status.connected,
        authMode: status.authMode,
        folderId: status.folderId,
        folderName: env.GOOGLE_DRIVE_FOLDER_NAME,
        ...(!status.connected ? { message: status.configured ? 'Google Drive OAuth is configured but not authorized yet.' : 'Google Drive is not configured.' } : {}),
      };
    }

    const connected = Boolean(env.GOOGLE_DRIVE_ACCESS_TOKEN || (env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN));
    return {
      ok: connected,
      enabled: connected,
      connected,
      authMode: env.GOOGLE_DRIVE_ACCESS_TOKEN ? 'access_token' : connected ? 'oauth_refresh_env' : 'none',
      folderId: env.GOOGLE_DRIVE_FOLDER_ID ?? null,
      folderName: env.GOOGLE_DRIVE_FOLDER_NAME,
      ...(!connected ? { message: 'Google Drive is not configured.' } : {}),
    };
  }

  async createAuthorizationUrl(redirectUri: string): Promise<string> {
    if (!this.oauth) throw new Error('Google Drive OAuth storage is unavailable.');
    return this.oauth.createAuthorizationUrl(redirectUri);
  }

  async handleOAuthCallback(code: string, state: string): Promise<void> {
    if (!this.oauth) throw new Error('Google Drive OAuth storage is unavailable.');
    await this.oauth.handleCallback(code, state);
    await this.ensureExportFolder();
  }

  async testConnection(): Promise<DriveConnectionProbe> {
    const status = await this.oauthStatus();
    if (!status.connected) return status;
    try {
      const token = await this.getAccessToken();
      if (!token) return { ...status, ok: false, connected: false, message: 'Google Drive is not authorized.' };
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName)', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return { ...status, ok: false, message: `Google Drive returned ${response.status}.` };
      const folderId = await this.ensureExportFolder();
      return { ...status, ok: true, connected: true, folderId };
    } catch (error) {
      return { ...status, ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async uploadText(name: string, content: string, mimeType = 'text/plain'): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    return this.uploadBytes(name, new TextEncoder().encode(content), mimeType);
  }

  async uploadFromUrl(name: string, url: string, mimeType?: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    const source = await fetch(url);
    if (!source.ok) throw new Error(`Asset download failed: ${source.status} ${source.statusText}`);
    const bytes = new Uint8Array(await source.arrayBuffer());
    const detected = mimeType || source.headers.get('content-type') || 'application/octet-stream';
    return this.uploadBytes(name, bytes, detected);
  }

  async uploadBytes(name: string, bytes: Uint8Array, mimeType: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    const folderId = await this.ensureExportFolder();
    const boundary = `ghaith-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name,
      ...(folderId ? { parents: [folderId] } : {}),
    });
    const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const suffix = `\r\n--${boundary}--`;
    const binary = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(binary).set(bytes);
    const body = new Blob([prefix, binary, suffix]);

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

  async ensureExportFolder(): Promise<string | undefined> {
    if (env.GOOGLE_DRIVE_FOLDER_ID) return env.GOOGLE_DRIVE_FOLDER_ID;
    const stored = await this.store?.getGoogleDriveFolderId();
    if (stored) return stored;

    const token = await this.getAccessToken();
    if (!token || !this.store) return undefined;
    const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: env.GOOGLE_DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (!response.ok) throw new Error(`Google Drive folder creation failed: ${response.status} ${await response.text()}`);
    const folder = await response.json() as { id?: string };
    if (!folder.id) throw new Error('Google Drive did not return an export folder ID.');
    await this.store.setGoogleDriveFolderId(folder.id);
    return folder.id;
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
