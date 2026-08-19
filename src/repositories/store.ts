import { randomUUID } from 'node:crypto';
import type { ContentItem, Opportunity, PublicationLog, Report } from '../core/types';
import { NotFoundError } from '../core/errors';
import type {
  CanvaOAuthPendingState,
  CanvaOAuthTokenState,
  DatabaseBackend,
  GoogleDriveOAuthPendingState,
  GoogleDriveOAuthTokenState,
  GoogleDriveWatchState,
  PushSubscriptionState,
} from './database';

export class Store {
  constructor(private readonly db: DatabaseBackend) {}

  async healthCheck(): Promise<void> { await this.db.read(); }

  async createReport(input: Omit<Report, 'id' | 'createdAt'>): Promise<Report> {
    const report: Report = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    return this.db.mutate((db) => { db.reports.push(report); return report; });
  }
  async listReports() { return (await this.db.read()).reports; }
  async getReport(id: string) {
    const item = (await this.db.read()).reports.find((x) => x.id === id);
    if (!item) throw new NotFoundError('Report');
    return item;
  }

  async saveOpportunity(input: Omit<Opportunity, 'id' | 'createdAt'>): Promise<Opportunity> {
    const opportunity: Opportunity = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    return this.db.mutate((db) => { db.opportunities.push(opportunity); return opportunity; });
  }
  async listOpportunities() { return (await this.db.read()).opportunities.sort((a, b) => b.score.total - a.score.total); }
  async getOpportunity(id: string) {
    const item = (await this.db.read()).opportunities.find((x) => x.id === id);
    if (!item) throw new NotFoundError('Opportunity');
    return item;
  }

  async createContent(input: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt' | 'revision'>): Promise<ContentItem> {
    const now = new Date().toISOString();
    const item: ContentItem = { ...input, id: randomUUID(), createdAt: now, updatedAt: now, revision: 1 };
    return this.db.mutate((db) => { db.contents.push(item); return item; });
  }
  async listContents() { return (await this.db.read()).contents; }
  async getContent(id: string) {
    const item = (await this.db.read()).contents.find((x) => x.id === id);
    if (!item) throw new NotFoundError('Content');
    return item;
  }
  async updateContent(id: string, patch: Partial<ContentItem>): Promise<ContentItem> {
    return this.db.mutate((db) => {
      const index = db.contents.findIndex((x) => x.id === id);
      if (index < 0) throw new NotFoundError('Content');
      const current = db.contents[index]!;
      const updated: ContentItem = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
      db.contents[index] = updated;
      return updated;
    });
  }

  async addLog(input: Omit<PublicationLog, 'id' | 'timestamp'>): Promise<PublicationLog> {
    const log: PublicationLog = { ...input, id: randomUUID(), timestamp: new Date().toISOString() };
    return this.db.mutate((db) => { db.logs.push(log); return log; });
  }
  async listLogs() { return (await this.db.read()).logs; }
  async findSuccessfulLog(idempotencyKey: string) {
    return (await this.db.read()).logs.find((x) => x.idempotencyKey === idempotencyKey && x.result === 'SUCCESS');
  }

  async getCanvaOAuthToken(): Promise<CanvaOAuthTokenState | undefined> {
    return (await this.db.read()).integrations.canva?.token;
  }
  async setCanvaOAuthToken(token: CanvaOAuthTokenState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.canva ??= {};
      db.integrations.canva.token = token;
    });
  }
  async getCanvaOAuthPending(): Promise<CanvaOAuthPendingState | undefined> {
    return (await this.db.read()).integrations.canva?.pending;
  }
  async setCanvaOAuthPending(pending: CanvaOAuthPendingState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.canva ??= {};
      db.integrations.canva.pending = pending;
    });
  }

  async getGoogleDriveOAuthToken(): Promise<GoogleDriveOAuthTokenState | undefined> {
    return (await this.db.read()).integrations.googleDrive?.token;
  }
  async setGoogleDriveOAuthToken(token: GoogleDriveOAuthTokenState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.token = token;
    });
  }
  async getGoogleDriveOAuthPending(): Promise<GoogleDriveOAuthPendingState | undefined> {
    return (await this.db.read()).integrations.googleDrive?.pending;
  }
  async setGoogleDriveOAuthPending(pending: GoogleDriveOAuthPendingState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.pending = pending;
    });
  }
  async getGoogleDriveFolderId(): Promise<string | undefined> {
    return (await this.db.read()).integrations.googleDrive?.folderId;
  }
  async setGoogleDriveFolderId(folderId: string | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.folderId = folderId;
    });
  }
  async getGoogleDriveWatch(): Promise<GoogleDriveWatchState | undefined> {
    return (await this.db.read()).integrations.googleDrive?.watch;
  }
  async setGoogleDriveWatch(watch: GoogleDriveWatchState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.watch = watch;
    });
  }

  async getPushVapidKeys(): Promise<{ publicKey: string; privateKey: string } | undefined> {
    const state = (await this.db.read()).integrations.notifications;
    return state?.vapidPublicKey && state.vapidPrivateKey
      ? { publicKey: state.vapidPublicKey, privateKey: state.vapidPrivateKey }
      : undefined;
  }
  async setPushVapidKeys(publicKey: string, privateKey: string): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.notifications ??= {};
      db.integrations.notifications.vapidPublicKey = publicKey;
      db.integrations.notifications.vapidPrivateKey = privateKey;
    });
  }
  async listPushSubscriptions(): Promise<PushSubscriptionState[]> {
    return [...((await this.db.read()).integrations.notifications?.subscriptions ?? [])];
  }
  async upsertPushSubscription(input: Omit<PushSubscriptionState, 'createdAt' | 'updatedAt'>): Promise<PushSubscriptionState> {
    const now = new Date().toISOString();
    return this.db.mutate((db) => {
      db.integrations.notifications ??= {};
      db.integrations.notifications.subscriptions ??= [];
      const index = db.integrations.notifications.subscriptions.findIndex((item) => item.endpoint === input.endpoint);
      const existing = index >= 0 ? db.integrations.notifications.subscriptions[index] : undefined;
      const subscription: PushSubscriptionState = {
        ...input,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (index >= 0) db.integrations.notifications.subscriptions[index] = subscription;
      else db.integrations.notifications.subscriptions.push(subscription);
      return subscription;
    });
  }
  async removePushSubscription(endpoint: string): Promise<void> {
    await this.db.mutate((db) => {
      const state = db.integrations.notifications;
      if (!state?.subscriptions) return;
      state.subscriptions = state.subscriptions.filter((item) => item.endpoint !== endpoint);
    });
  }
}