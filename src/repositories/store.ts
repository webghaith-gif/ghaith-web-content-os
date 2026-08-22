import { randomUUID } from 'node:crypto';
import type { ContentItem, Opportunity, ProductDraft, PublicationLog, Report, ReportAutomationState } from '../core/types';
import { NotFoundError } from '../core/errors';
import type {
  CanvaOAuthPendingState,
  CanvaOAuthTokenState,
  ClickUpWebhookState,
  DatabaseBackend,
  GoogleDriveOAuthPendingState,
  GoogleDriveOAuthTokenState,
  GoogleDriveWatchState,
  PushSubscriptionState,
} from './database';

export class Store {
  constructor(private readonly db: DatabaseBackend) {}

  private async freshRead() {
    return this.db.readFresh ? this.db.readFresh() : this.db.read();
  }

  async healthCheck(): Promise<void> { await this.db.read(); }

  async createReport(input: Omit<Report, 'id' | 'createdAt'>): Promise<Report> {
    const titleKey = normalizeForDedup(input.title);
    const bodyKey = normalizeForDedup(input.body);
    const existing = (await this.db.read()).reports.find((item) =>
      normalizeForDedup(item.title) === titleKey && normalizeForDedup(item.body) === bodyKey
    );
    if (existing) return existing;

    const report: Report = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    return this.db.mutate((db) => {
      const duplicate = db.reports.find((item) =>
        normalizeForDedup(item.title) === titleKey && normalizeForDedup(item.body) === bodyKey
      );
      if (duplicate) return duplicate;
      db.reports.push(report);
      return report;
    });
  }
  async listReports() { return (await this.db.read()).reports; }
  async getReport(id: string) {
    const item = (await this.db.read()).reports.find((x) => x.id === id);
    if (!item) throw new NotFoundError('Report');
    return item;
  }
  async updateReport(id: string, patch: Partial<Report>) {
    return this.db.mutate((db) => {
      const index = db.reports.findIndex((x) => x.id === id);
      if (index < 0) throw new NotFoundError('Report');
      db.reports[index] = { ...db.reports[index]!, ...patch };
      return db.reports[index]!;
    });
  }
  async patchReportAutomation(id: string, patch: Partial<ReportAutomationState>): Promise<Report> {
    return this.db.mutate((db) => {
      const index = db.reports.findIndex((x) => x.id === id);
      if (index < 0) throw new NotFoundError('Report');
      const current = db.reports[index]!;
      db.reports[index] = {
        ...current,
        automation: { version: 1, ...(current.automation ?? {}), ...patch },
      };
      return db.reports[index]!;
    });
  }

  async saveOpportunity(input: Omit<Opportunity, 'id' | 'createdAt'>): Promise<Opportunity> {
    const titleKey = normalizeForDedup(input.title);
    const rationaleKey = normalizeForDedup(input.rationale);
    const existing = (await this.db.read()).opportunities.find((item) =>
      item.reportId === input.reportId
      && normalizeForDedup(item.title) === titleKey
      && normalizeForDedup(item.rationale) === rationaleKey
    );
    if (existing) return existing;

    const opportunity: Opportunity = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    return this.db.mutate((db) => {
      const duplicate = db.opportunities.find((item) =>
        item.reportId === input.reportId
        && normalizeForDedup(item.title) === titleKey
        && normalizeForDedup(item.rationale) === rationaleKey
      );
      if (duplicate) return duplicate;
      db.opportunities.push(opportunity);
      return opportunity;
    });
  }
  async listOpportunities() { return (await this.db.read()).opportunities.sort((a, b) => b.score.total - a.score.total); }
  async getOpportunity(id: string) {
    const item = (await this.db.read()).opportunities.find((x) => x.id === id);
    if (!item) throw new NotFoundError('Opportunity');
    return item;
  }

  async createContent(input: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt' | 'revision'>): Promise<ContentItem> {
    const platformKey = normalizedPlatformKey(input.platforms);
    const existing = (await this.db.read()).contents.find((item) =>
      item.opportunityId === input.opportunityId
      && normalizedPlatformKey(item.platforms) === platformKey
      && item.status !== 'ARCHIVED'
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const item: ContentItem = { ...input, id: randomUUID(), createdAt: now, updatedAt: now, revision: 1 };
    return this.db.mutate((db) => {
      const duplicate = db.contents.find((current) =>
        current.opportunityId === input.opportunityId
        && normalizedPlatformKey(current.platforms) === platformKey
        && current.status !== 'ARCHIVED'
      );
      if (duplicate) return duplicate;
      db.contents.push(item);
      return item;
    });
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

  async createProduct(input: Omit<ProductDraft, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ product: ProductDraft; created: boolean }> {
    const existing = (await this.db.read()).products.find((item) => item.opportunityId === input.opportunityId && item.status !== 'ARCHIVED');
    if (existing) return { product: existing, created: false };
    const now = new Date().toISOString();
    const product: ProductDraft = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    return this.db.mutate((db) => {
      const duplicate = db.products.find((item) => item.opportunityId === input.opportunityId && item.status !== 'ARCHIVED');
      if (duplicate) return { product: duplicate, created: false };
      db.products.push(product);
      return { product, created: true };
    });
  }
  async listProducts() { return (await this.db.read()).products; }
  async getProduct(id: string) {
    const item = (await this.db.read()).products.find((x) => x.id === id);
    if (!item) throw new NotFoundError('Product');
    return item;
  }
  async updateProduct(id: string, patch: Partial<ProductDraft>): Promise<ProductDraft> {
    return this.db.mutate((db) => {
      const index = db.products.findIndex((x) => x.id === id);
      if (index < 0) throw new NotFoundError('Product');
      const current = db.products[index]!;
      const updated: ProductDraft = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
      db.products[index] = updated;
      return updated;
    });
  }

  async markContentPublished(id: string, publishedAt = new Date().toISOString()): Promise<{ content: ContentItem; changed: boolean }> {
    return this.db.mutate((db) => {
      const index = db.contents.findIndex((x) => x.id === id);
      if (index < 0) throw new NotFoundError('Content');
      const current = db.contents[index]!;
      if (current.status === 'PUBLISHED') return { content: current, changed: false };
      const updated: ContentItem = {
        ...current,
        status: 'PUBLISHED',
        publishedAt: current.publishedAt ?? publishedAt,
        updatedAt: new Date().toISOString(),
      };
      db.contents[index] = updated;
      return { content: updated, changed: true };
    });
  }

  async addLogWithOutcome(input: Omit<PublicationLog, 'id' | 'timestamp'>): Promise<{ log: PublicationLog; created: boolean }> {
    const log: PublicationLog = { ...input, id: randomUUID(), timestamp: new Date().toISOString() };
    return this.db.mutate((db) => {
      if (input.result === 'SUCCESS') {
        const existing = db.logs.find((x) => x.idempotencyKey === input.idempotencyKey && x.result === 'SUCCESS');
        if (existing) return { log: existing, created: false };
      }
      db.logs.push(log);
      return { log, created: true };
    });
  }

  async addLog(input: Omit<PublicationLog, 'id' | 'timestamp'>): Promise<PublicationLog> {
    return (await this.addLogWithOutcome(input)).log;
  }
  async listLogs() { return (await this.db.read()).logs; }
  async findSuccessfulLog(idempotencyKey: string) {
    return (await this.db.read()).logs.find((x) => x.idempotencyKey === idempotencyKey && x.result === 'SUCCESS');
  }

  async getCanvaOAuthToken(): Promise<CanvaOAuthTokenState | undefined> {
    return (await this.freshRead()).integrations.canva?.token;
  }
  async setCanvaOAuthToken(token: CanvaOAuthTokenState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.canva ??= {};
      db.integrations.canva.token = token;
    });
  }
  async getCanvaOAuthPending(): Promise<CanvaOAuthPendingState | undefined> {
    return (await this.freshRead()).integrations.canva?.pending;
  }
  async setCanvaOAuthPending(pending: CanvaOAuthPendingState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.canva ??= {};
      db.integrations.canva.pending = pending;
    });
  }

  async getGoogleDriveOAuthToken(): Promise<GoogleDriveOAuthTokenState | undefined> {
    return (await this.freshRead()).integrations.googleDrive?.token;
  }
  async setGoogleDriveOAuthToken(token: GoogleDriveOAuthTokenState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.token = token;
    });
  }
  async getGoogleDriveOAuthPending(): Promise<GoogleDriveOAuthPendingState | undefined> {
    return (await this.freshRead()).integrations.googleDrive?.pending;
  }
  async setGoogleDriveOAuthPending(pending: GoogleDriveOAuthPendingState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.pending = pending;
    });
  }
  async getGoogleDriveFolderId(): Promise<string | undefined> {
    return (await this.freshRead()).integrations.googleDrive?.folderId;
  }
  async setGoogleDriveFolderId(folderId: string | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.folderId = folderId;
    });
  }
  async getGoogleDriveWatch(): Promise<GoogleDriveWatchState | undefined> {
    return (await this.freshRead()).integrations.googleDrive?.watch;
  }
  async setGoogleDriveWatch(watch: GoogleDriveWatchState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.googleDrive ??= {};
      db.integrations.googleDrive.watch = watch;
    });
  }

  async getClickUpWebhook(): Promise<ClickUpWebhookState | undefined> {
    return (await this.freshRead()).integrations.clickup?.webhook;
  }
  async setClickUpWebhook(webhook: ClickUpWebhookState | undefined): Promise<void> {
    await this.db.mutate((db) => {
      db.integrations.clickup ??= {};
      db.integrations.clickup.webhook = webhook;
    });
  }
  async markClickUpLogTaskProcessed(taskId: string): Promise<boolean> {
    return this.db.mutate((db) => {
      db.integrations.clickup ??= {};
      const webhook = db.integrations.clickup.webhook;
      if (!webhook) return false;
      webhook.processedLogTaskIds ??= [];
      if (webhook.processedLogTaskIds.includes(taskId)) return false;
      webhook.processedLogTaskIds.push(taskId);
      if (webhook.processedLogTaskIds.length > 250) webhook.processedLogTaskIds.splice(0, webhook.processedLogTaskIds.length - 250);
      return true;
    });
  }
  async releaseClickUpLogTaskProcessed(taskId: string): Promise<void> {
    await this.db.mutate((db) => {
      const webhook = db.integrations.clickup?.webhook;
      if (!webhook?.processedLogTaskIds) return;
      webhook.processedLogTaskIds = webhook.processedLogTaskIds.filter((id) => id !== taskId);
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

function normalizeForDedup(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizedPlatformKey(platforms: string[]): string {
  return [...new Set(platforms.map((item) => item.trim().toLowerCase()).filter(Boolean))].sort().join(',');
}
