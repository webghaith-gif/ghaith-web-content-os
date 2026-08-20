import { env } from '../config/env';
import type { Store } from '../repositories/store';
import type { GoogleDriveWatchState } from '../repositories/database';
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

export interface DriveChangedFile {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
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
    await this.oauth.handleOAuthCallback?.(code, state);
    if (!this.oauth.handleOAuthCallback) await this.oauth.handleCallback(code, state);
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

  async uploadText(name: string, content: string, mimeType = 'text/plain', parentFolderId?: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    return this.uploadBytes(name, new TextEncoder().encode(content), mimeType, parentFolderId);
  }

  async upsertText(name: string, content: string, mimeType = 'text/plain', parentFolderId?: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    const folderId = parentFolderId ?? await this.ensureExportFolder();
    if (!folderId) return undefined;
    const existing = await this.findFileByName(name, folderId, token);
    if (!existing) return this.uploadText(name, content, mimeType, folderId);

    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,webViewLink`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
      },
      body: content,
    });
    if (!response.ok) throw new Error(`Google Drive text update failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<DriveUploadResult>;
  }

  async uploadFromUrl(name: string, url: string, mimeType?: string, parentFolderId?: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    const source = await fetch(url);
    if (!source.ok) throw new Error(`Asset download failed: ${source.status} ${source.statusText}`);
    const bytes = new Uint8Array(await source.arrayBuffer());
    const detected = mimeType || source.headers.get('content-type') || 'application/octet-stream';
    return this.uploadBytes(name, bytes, detected, parentFolderId);
  }

  async uploadBytes(name: string, bytes: Uint8Array, mimeType: string, parentFolderId?: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    const folderId = parentFolderId ?? await this.ensureExportFolder();
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

  async upsertBytes(name: string, bytes: Uint8Array, mimeType: string, parentFolderId?: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    const folderId = parentFolderId ?? await this.ensureExportFolder();
    if (!folderId) return undefined;
    const existing = await this.findFileByName(name, folderId, token);
    if (!existing) return this.uploadBytes(name, bytes, mimeType, folderId);

    const binary = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(binary).set(bytes);
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,webViewLink`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      body: binary,
    });
    if (!response.ok) throw new Error(`Google Drive binary update failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<DriveUploadResult>;
  }

  async replaceBytes(fileId: string, bytes: Uint8Array, mimeType: string): Promise<DriveUploadResult | undefined> {
    const token = await this.getAccessToken();
    if (!token) return undefined;
    const binary = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(binary).set(bytes);
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,webViewLink`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      body: binary,
    });
    if (!response.ok) throw new Error(`Google Drive binary replacement failed: ${response.status} ${await response.text()}`);
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

  async ensureChildFolder(name: string, parentFolderId: string): Promise<string> {
    const token = await this.getAccessToken();
    if (!token) throw new Error('Google Drive is not authorized.');
    const escapedName = escapeDriveQuery(name);
    const escapedParent = escapeDriveQuery(parentFolderId);
    const q = `name = '${escapedName}' and '${escapedParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
    listUrl.searchParams.set('q', q);
    listUrl.searchParams.set('fields', 'files(id,name)');
    listUrl.searchParams.set('pageSize', '10');
    const existingResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!existingResponse.ok) throw new Error(`Google Drive folder lookup failed: ${existingResponse.status} ${await existingResponse.text()}`);
    const existing = await existingResponse.json() as { files?: Array<{ id?: string; name?: string }> };
    const found = existing.files?.find((file) => file.id);
    if (found?.id) return found.id;

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });
    if (!createResponse.ok) throw new Error(`Google Drive child folder creation failed: ${createResponse.status} ${await createResponse.text()}`);
    const created = await createResponse.json() as { id?: string };
    if (!created.id) throw new Error('Google Drive did not return a child folder ID.');
    return created.id;
  }

  folderUrl(folderId: string) {
    return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
  }

  async watchStatus() {
    const watch = await this.store?.getGoogleDriveWatch();
    return {
      enabled: Boolean(watch && watch.expiration > Date.now()),
      expiration: watch?.expiration ?? null,
      webhookUrl: watch?.webhookUrl ?? null,
      channelId: watch?.channelId ?? null,
    };
  }

  async ensureChangesWatch(webhookUrl: string): Promise<GoogleDriveWatchState> {
    if (!this.store) throw new Error('Google Drive watch storage is unavailable.');
    const token = await this.getAccessToken();
    if (!token) throw new Error('Google Drive is not authorized.');
    const existing = await this.store.getGoogleDriveWatch();
    const renewalThreshold = Date.now() + 36 * 60 * 60 * 1000;
    if (existing && existing.expiration > renewalThreshold && existing.webhookUrl === webhookUrl) return existing;

    if (existing?.resourceId) {
      await fetch('https://www.googleapis.com/drive/v3/channels/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing.channelId, resourceId: existing.resourceId }),
      }).catch(() => undefined);
    }

    let pageToken = existing?.pageToken;
    if (!pageToken) {
      const start = await fetch('https://www.googleapis.com/drive/v3/changes/startPageToken', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!start.ok) throw new Error(`Google Drive start page token failed: ${start.status} ${await start.text()}`);
      const data = await start.json() as { startPageToken?: string };
      if (!data.startPageToken) throw new Error('Google Drive did not return startPageToken.');
      pageToken = data.startPageToken;
    }

    const channelId = crypto.randomUUID();
    const channelToken = crypto.randomUUID();
    const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const watchUrl = new URL('https://www.googleapis.com/drive/v3/changes/watch');
    watchUrl.searchParams.set('pageToken', pageToken);
    watchUrl.searchParams.set('spaces', 'drive');
    watchUrl.searchParams.set('supportsAllDrives', 'true');
    watchUrl.searchParams.set('includeItemsFromAllDrives', 'true');
    const response = await fetch(watchUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        token: channelToken,
        expiration,
      }),
    });
    if (!response.ok) throw new Error(`Google Drive changes.watch failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { resourceId?: string; expiration?: string };
    const state: GoogleDriveWatchState = {
      channelId,
      resourceId: data.resourceId,
      channelToken,
      expiration: Number(data.expiration ?? expiration),
      pageToken,
      knownFileIds: existing?.knownFileIds ?? [],
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      webhookUrl,
    };
    await this.store.setGoogleDriveWatch(state);
    return state;
  }

  async consumeChanges(channelId?: string, channelToken?: string): Promise<DriveChangedFile[]> {
    if (!this.store) throw new Error('Google Drive watch storage is unavailable.');
    const state = await this.store.getGoogleDriveWatch();
    if (!state) return [];
    if (channelId && channelId !== state.channelId) return [];
    if (channelToken && channelToken !== state.channelToken) return [];

    const accessToken = await this.getAccessToken();
    if (!accessToken) return [];
    const rootFolderId = await this.ensureExportFolder();
    if (!rootFolderId) return [];

    const known = new Set(state.knownFileIds ?? []);
    const newFiles: DriveChangedFile[] = [];
    let pageToken = state.pageToken;
    const metadataCache = new Map<string, { id: string; parents?: string[]; mimeType?: string }>();

    for (let page = 0; page < 20; page += 1) {
      const request = new URL('https://www.googleapis.com/drive/v3/changes');
      request.searchParams.set('pageToken', pageToken);
      request.searchParams.set('spaces', 'drive');
      request.searchParams.set('includeRemoved', 'true');
      request.searchParams.set('supportsAllDrives', 'true');
      request.searchParams.set('includeItemsFromAllDrives', 'true');
      request.searchParams.set('pageSize', '100');
      request.searchParams.set('fields', 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,parents,webViewLink,trashed))');
      const response = await fetch(request, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error(`Google Drive changes.list failed: ${response.status} ${await response.text()}`);
      const data = await response.json() as {
        nextPageToken?: string;
        newStartPageToken?: string;
        changes?: Array<{ fileId?: string; removed?: boolean; file?: { id?: string; name?: string; mimeType?: string; parents?: string[]; webViewLink?: string; trashed?: boolean } }>;
      };

      for (const change of data.changes ?? []) {
        const fileId = change.file?.id ?? change.fileId;
        if (!fileId) continue;
        if (change.removed || change.file?.trashed) {
          known.delete(fileId);
          continue;
        }
        const file = change.file;
        if (!file?.id) continue;
        const inside = await this.isWithinTree(file, rootFolderId, accessToken, metadataCache);
        if (!inside) {
          known.delete(fileId);
          continue;
        }
        if (!known.has(fileId)) {
          known.add(fileId);
          if (file.mimeType !== 'application/vnd.google-apps.folder') {
            newFiles.push({ id: file.id, name: file.name ?? 'ملف جديد', mimeType: file.mimeType, webViewLink: file.webViewLink });
          }
        }
      }

      if (data.nextPageToken) {
        pageToken = data.nextPageToken;
        continue;
      }
      pageToken = data.newStartPageToken ?? pageToken;
      break;
    }

    await this.store.setGoogleDriveWatch({ ...state, pageToken, knownFileIds: [...known].slice(-10000) });
    return newFiles;
  }

  private async findFileByName(name: string, parentFolderId: string, accessToken: string): Promise<DriveUploadResult | undefined> {
    const escapedName = escapeDriveQuery(name);
    const escapedParent = escapeDriveQuery(parentFolderId);
    const q = `name = '${escapedName}' and '${escapedParent}' in parents and trashed = false`;
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('fields', 'files(id,name,webViewLink)');
    url.searchParams.set('pageSize', '10');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive file lookup failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { files?: DriveUploadResult[] };
    return data.files?.find((file) => file.id);
  }

  private async isWithinTree(
    file: { id?: string; parents?: string[] },
    rootFolderId: string,
    accessToken: string,
    cache: Map<string, { id: string; parents?: string[]; mimeType?: string }>,
    depth = 0,
  ): Promise<boolean> {
    if (file.id === rootFolderId) return true;
    const parents = file.parents ?? [];
    if (parents.includes(rootFolderId)) return true;
    if (depth >= 12 || parents.length === 0) return false;
    for (const parentId of parents) {
      let parent = cache.get(parentId);
      if (!parent) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parentId)}?fields=id,parents,mimeType&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) continue;
        parent = await response.json() as { id: string; parents?: string[]; mimeType?: string };
        cache.set(parentId, parent);
      }
      if (await this.isWithinTree(parent, rootFolderId, accessToken, cache, depth + 1)) return true;
    }
    return false;
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

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
