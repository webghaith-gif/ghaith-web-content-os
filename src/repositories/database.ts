import type { ContentItem, Opportunity, ProductDraft, PublicationLog, Report } from '../core/types';

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

export interface GoogleDriveWatchState {
  channelId: string;
  resourceId?: string;
  channelToken: string;
  expiration: number;
  pageToken: string;
  knownFileIds: string[];
  startedAt: string;
  webhookUrl: string;
}

export interface ClickUpWebhookState {
  id: string;
  secret: string;
  endpoint: string;
  workspaceId: string;
  listId: string;
  createdAt: string;
  processedLogTaskIds?: string[];
}

export interface PushSubscriptionState {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
  createdAt: string;
  updatedAt: string;
}

export interface PushNotificationState {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  subscriptions?: PushSubscriptionState[];
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
    watch?: GoogleDriveWatchState;
  };
  clickup?: {
    webhook?: ClickUpWebhookState;
  };
  notifications?: PushNotificationState;
}

export interface DatabaseShape {
  reports: Report[];
  opportunities: Opportunity[];
  contents: ContentItem[];
  products: ProductDraft[];
  logs: PublicationLog[];
  integrations: IntegrationState;
}

export interface DatabaseBackend {
  read(): Promise<DatabaseShape>;
  readFresh?(): Promise<DatabaseShape>;
  mutate<T>(fn: (db: DatabaseShape) => T | Promise<T>): Promise<T>;
}

export const emptyDb = (): DatabaseShape => ({ reports: [], opportunities: [], contents: [], products: [], logs: [], integrations: {} });

export function normalizeDb(value: Partial<DatabaseShape> | undefined | null): DatabaseShape {
  return {
    reports: Array.isArray(value?.reports) ? value.reports : [],
    opportunities: Array.isArray(value?.opportunities) ? value.opportunities : [],
    contents: Array.isArray(value?.contents) ? value.contents : [],
    products: Array.isArray(value?.products) ? value.products : [],
    logs: Array.isArray(value?.logs) ? value.logs : [],
    integrations: value?.integrations && typeof value.integrations === 'object' ? value.integrations : {},
  };
}
