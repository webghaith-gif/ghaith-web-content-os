import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../core/errors';
import { env } from '../config/env';
import { GoogleDriveOAuthManager } from '../integrations/google-drive-oauth';
import { Store } from '../repositories/store';

const VIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = VIEW_TTL_MS + 60 * 60 * 1000;
const GOOGLE_WORKSPACE_EXPORTABLE = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
]);

export interface DriveViewerOpenResult {
  name: string;
  sourceMimeType: string;
  response: Response;
}

export class DriveViewerService {
  private readonly oauth: GoogleDriveOAuthManager;

  constructor(store: Store) {
    this.oauth = new GoogleDriveOAuthManager(store);
  }

  linkForFileId(fileId: string): string | undefined {
    const id = fileId.trim();
    const secret = env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
    if (!id || !secret) return undefined;
    const expires = Date.now() + VIEW_TTL_MS;
    const signature = this.sign(id, expires, secret);
    return `/api/drive-view/${encodeURIComponent(id)}?expires=${expires}&signature=${encodeURIComponent(signature)}`;
  }

  linkForDriveUrl(value?: string): string | undefined {
    const fileId = extractDriveFileId(value);
    return fileId ? this.linkForFileId(fileId) : undefined;
  }

  async open(fileId: string, expiresRaw: string | null, signature: string | null, range?: string): Promise<DriveViewerOpenResult> {
    const id = fileId.trim();
    if (!id || !this.verify(id, expiresRaw, signature)) {
      throw new AppError('رابط معاينة Drive غير صالح أو انتهت صلاحيته.', 403, 'DRIVE_VIEW_FORBIDDEN');
    }

    const token = await this.oauth.getAccessToken();
    if (!token) throw new AppError('Google Drive غير متصل حاليًا.', 503, 'DRIVE_NOT_CONNECTED');

    const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
    metadataUrl.searchParams.set('fields', 'id,name,mimeType,trashed');
    metadataUrl.searchParams.set('supportsAllDrives', 'true');
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (metadataResponse.status === 404) throw new AppError('ملف Drive غير موجود.', 404, 'DRIVE_FILE_NOT_FOUND');
    if (!metadataResponse.ok) {
      throw new AppError(`تعذر قراءة بيانات ملف Drive (${metadataResponse.status}).`, 502, 'DRIVE_METADATA_ERROR');
    }

    const metadata = await metadataResponse.json() as {
      id?: string;
      name?: string;
      mimeType?: string;
      trashed?: boolean;
    };
    if (metadata.trashed) throw new AppError('ملف Drive موجود في سلة المهملات.', 404, 'DRIVE_FILE_NOT_FOUND');
    const sourceMimeType = metadata.mimeType ?? 'application/octet-stream';
    if (sourceMimeType === 'application/vnd.google-apps.folder') {
      throw new AppError('هذا الرابط يشير إلى مجلد وليس ملفًا.', 415, 'DRIVE_FOLDER_NOT_PREVIEWABLE');
    }

    let response: Response;
    if (GOOGLE_WORKSPACE_EXPORTABLE.has(sourceMimeType)) {
      const exportUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export`);
      exportUrl.searchParams.set('mimeType', 'application/pdf');
      response = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    } else if (sourceMimeType.startsWith('application/vnd.google-apps.')) {
      throw new AppError('نوع ملف Google هذا لا يدعم المعاينة الداخلية حاليًا.', 415, 'DRIVE_FILE_NOT_PREVIEWABLE');
    } else {
      const mediaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
      mediaUrl.searchParams.set('alt', 'media');
      mediaUrl.searchParams.set('supportsAllDrives', 'true');
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (range?.trim()) headers.Range = range.trim();
      response = await fetch(mediaUrl, { headers, cache: 'no-store' });
    }

    if (response.status === 401 || response.status === 403) {
      throw new AppError('صلاحية قراءة محتوى Drive غير مفعّلة بعد. أعد ربط Google Drive ووافق على القراءة.', 403, 'DRIVE_CONTENT_PERMISSION_REQUIRED');
    }
    if (!response.ok && response.status !== 206) {
      throw new AppError(`تعذر فتح ملف Drive (${response.status}).`, 502, 'DRIVE_CONTENT_ERROR');
    }

    return {
      name: metadata.name ?? 'Ghaith-Web-Drive-File',
      sourceMimeType,
      response,
    };
  }

  private verify(fileId: string, expiresRaw: string | null, signature: string | null): boolean {
    const secret = env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
    const expires = Number(expiresRaw ?? '');
    if (!secret || !signature || !Number.isFinite(expires)) return false;
    const now = Date.now();
    if (expires <= now || expires > now + MAX_FUTURE_SKEW_MS) return false;
    const expected = this.sign(fileId, expires, secret);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private sign(fileId: string, expires: number, secret: string): string {
    return createHmac('sha256', secret)
      .update(`${fileId}.${expires}`)
      .digest('base64url');
  }
}

export function extractDriveFileId(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const pathMatch = raw.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (pathMatch?.[1]) return pathMatch[1];
  try {
    const url = new URL(raw);
    const id = url.searchParams.get('id')?.trim();
    return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
