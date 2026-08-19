import type { ContentItem, Opportunity, PublicationLog, Report } from '../core/types';

export interface CanvaOAuthTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}

export interface CanvaOAuthPendingState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: number;
}

export interface GoogleDriveOAuthTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}

export interface GoogleDriveOAuthPendingState {
  state: string;
  redirectUri: string;
  expiresAt: number;
}

export interface IntegrationState {
  canva?: {
    token?: CanvaOAuthTokenState;
    pending?: CanvaOAuthPendingState;
  };
  googleDrive?: {
    token?: GoogleDriveOAuthTokenState;
    pending?: GoogleDriveOAuthPendingState;
    folderId?: string;
  };
}

export interface DatabaseShape {
  reports: Report[];
  opportunities: Opportunity[];
  contents: ContentItem[];
  logs: PublicationLog[];
  integrations: IntegrationState;
}

export interface DatabaseBackend {
  read(): Promise<DatabaseShape>;
  mutate<T>(fn: (db: DatabaseShape) => T | Promise<T>): Promise<T>;
}

export const emptyDb = (): DatabaseShape => ({ reports: [], opportunities: [], contents: [], logs: [], integrations: {} });

export function normalizeDb(value: Partial<DatabaseShape> | undefined | null): DatabaseShape {
  return {
    reports: Array.isArray(value?.reports) ? value.reports : [],
    opportunities: Array.isArray(value?.opportunities) ? value.opportunities : [],
    contents: Array.isArray(value?.contents) ? value.contents : [],
    logs: Array.isArray(value?.logs) ? value.logs : [],
    integrations: value?.integrations && typeof value.integrations === 'object' ? value.integrations : {},
  };
}
