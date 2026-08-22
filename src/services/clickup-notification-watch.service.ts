import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../core/errors';
import { env } from '../config/env';
import { ClickUpAdapter } from '../integrations/clickup.adapter';
import { Store } from '../repositories/store';
import { PublishingOrchestrator } from './publishing-orchestrator';

export class ClickUpNotificationWatchService {
  constructor(
    private readonly store: Store,
    private readonly publishing: PublishingOrchestrator,
    private readonly clickup = new ClickUpAdapter(),
  ) {}

  async status() {
    const saved = await this.store.getClickUpWebhook();
    if (!saved) return { enabled: false, configured: false, active: false };
    if (!this.clickup.enabled) return { enabled: false, configured: true, active: false, webhookId: saved.id };

    try {
      const webhooks = await this.clickup.listWebhooks(saved.workspaceId);
      const current = webhooks.find((item) => item.id === saved.id);
      return {
        enabled: true,
        configured: true,
        active: Boolean(current && current.status !== 'inactive'),
        webhookId: saved.id,
        endpoint: saved.endpoint,
        event: 'taskStatusUpdated',
      };
    } catch (error) {
      return {
        enabled: true,
        configured: true,
        active: false,
        webhookId: saved.id,
        endpoint: saved.endpoint,
        warning: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async ensure(endpoint: string) {
    if (!this.clickup.enabled || !env.CLICKUP_LIST_ID) {
      throw new AppError('ClickUp is not configured for status notifications.', 503, 'INTEGRATION_DISABLED');
    }

    const saved = await this.store.getClickUpWebhook();
    const workspaceId = saved?.workspaceId ?? await this.clickup.getWorkspaceId();
    const webhooks = await this.clickup.listWebhooks(workspaceId);

    if (saved && saved.endpoint === endpoint && webhooks.some((item) => item.id === saved.id && item.status !== 'inactive')) {
      return {
        ok: true,
        created: false,
        active: true,
        webhookId: saved.id,
        endpoint: saved.endpoint,
        event: 'taskStatusUpdated',
      };
    }

    if (saved && webhooks.some((item) => item.id === saved.id)) {
      try { await this.clickup.deleteWebhook(saved.id); } catch { /* recreate below */ }
    }

    // A previous deployment may have created the endpoint before its secret was persisted.
    // Remove only an exact endpoint match owned by this authenticated ClickUp user.
    for (const item of webhooks) {
      if (item.endpoint === endpoint && item.id !== saved?.id) {
        try { await this.clickup.deleteWebhook(item.id); } catch { /* best effort */ }
      }
    }

    const created = await this.clickup.createStatusWebhook(endpoint, workspaceId);
    await this.store.setClickUpWebhook({
      id: created.id,
      secret: created.secret,
      endpoint,
      workspaceId,
      listId: env.CLICKUP_LIST_ID,
      createdAt: new Date().toISOString(),
    });

    return {
      ok: true,
      created: true,
      active: true,
      webhookId: created.id,
      endpoint,
      event: 'taskStatusUpdated',
    };
  }

  async consume(rawBody: Buffer, signature: string | undefined) {
    const saved = await this.store.getClickUpWebhook();
    if (!saved) throw new AppError('ClickUp status webhook is not configured.', 503, 'INTEGRATION_DISABLED');
    if (!signature || !validSignature(rawBody, signature, saved.secret)) {
      throw new AppError('Invalid ClickUp webhook signature.', 401, 'UNAUTHORIZED');
    }

    let body: Record<string, any>;
    try { body = JSON.parse(rawBody.toString('utf8')); }
    catch { throw new AppError('Invalid ClickUp webhook JSON.', 400, 'VALIDATION_ERROR'); }

    if (String(body.webhook_id ?? '') !== saved.id) {
      return { ok: true, ignored: true, reason: 'WEBHOOK_ID_MISMATCH' };
    }
    if (body.event !== 'taskStatusUpdated') {
      return { ok: true, ignored: true, reason: 'EVENT_NOT_RELEVANT' };
    }

    const history = Array.isArray(body.history_items) ? body.history_items : [];
    const expected = env.CLICKUP_STATUS_PUBLISHED.trim().toLowerCase();
    const becamePublished = history.some((item: any) =>
      item?.field === 'status' && String(item?.after?.status ?? '').trim().toLowerCase() === expected
    );
    if (!becamePublished) return { ok: true, ignored: true, reason: 'STATUS_NOT_PUBLISHED' };

    // Reuse the already-hardened reconciliation path. The webhook only wakes it immediately;
    // it does not alter the fixed Make scenario or trust the webhook payload as publication proof.
    const reconciliation = await this.publishing.reconcileClickUpWatchResults();
    return { ok: true, taskId: typeof body.task_id === 'string' ? body.task_id : undefined, reconciliation };
  }
}

function validSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const supplied = signature.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(supplied) || supplied.length !== expected.length) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(supplied, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}