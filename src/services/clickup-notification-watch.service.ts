import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../core/errors';
import { env } from '../config/env';
import { ClickUpAdapter } from '../integrations/clickup.adapter';
import { Store } from '../repositories/store';
import { NotificationService } from './notification.service';
import { PublishingOrchestrator } from './publishing-orchestrator';

export class ClickUpNotificationWatchService {
  private readonly notifications: NotificationService;

  constructor(
    private readonly store: Store,
    private readonly publishing: PublishingOrchestrator,
    private readonly clickup = new ClickUpAdapter(),
  ) {
    this.notifications = new NotificationService(store);
  }

  async status() {
    let saved = await this.store.getClickUpWebhook();
    if (!saved && this.clickup.enabled) {
      try {
        await this.ensure(canonicalWebhookEndpoint());
        saved = await this.store.getClickUpWebhook();
      } catch (error) {
        return {
          enabled: true,
          configured: false,
          active: false,
          warning: error instanceof Error ? error.message : String(error),
        };
      }
    }
    if (!saved) return { enabled: false, configured: false, active: false };
    const initial = saved;
    if (!this.clickup.enabled) return { enabled: false, configured: true, active: false, webhookId: initial.id };

    try {
      const webhooks = await this.clickup.listWebhooks(initial.workspaceId);
      const current = webhooks.find((item) => item.id === initial.id);
      if (!current || current.status === 'inactive') {
        await this.ensure(initial.endpoint || canonicalWebhookEndpoint());
        const healed = await this.store.getClickUpWebhook() ?? initial;
        const refreshed = await this.clickup.listWebhooks(healed.workspaceId);
        const active = refreshed.find((item) => item.id === healed.id);
        return {
          enabled: true,
          configured: true,
          active: Boolean(active && active.status !== 'inactive'),
          webhookId: healed.id,
          endpoint: healed.endpoint,
          event: 'taskStatusUpdated',
          selfHealed: true,
        };
      }
      return {
        enabled: true,
        configured: true,
        active: true,
        webhookId: initial.id,
        endpoint: initial.endpoint,
        event: 'taskStatusUpdated',
      };
    } catch (error) {
      return {
        enabled: true,
        configured: true,
        active: false,
        webhookId: initial.id,
        endpoint: initial.endpoint,
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
      processedLogTaskIds: saved?.processedLogTaskIds ?? [],
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

    const taskId = typeof body.task_id === 'string' ? body.task_id : String(body.task_id ?? '').trim();
    if (!taskId) return { ok: true, ignored: true, reason: 'MISSING_TASK_ID' };

    const history = Array.isArray(body.history_items) ? body.history_items : [];
    const expected = env.CLICKUP_STATUS_PUBLISHED.trim().toLowerCase();
    const becamePublished = history.some((item: any) =>
      item?.field === 'status' && String(item?.after?.status ?? '').trim().toLowerCase() === expected
    );

    // Make creates [LOG] ... ERROR/WARNING tasks in the same ClickUp List.
    // ClickUp emits taskStatusUpdated when a new task is created, so the existing
    // production webhook is enough; Make itself and its router remain untouched.
    if (!becamePublished) {
      const logResult = await this.notifyMakeProblemLog(taskId);
      if (logResult.handled) return { ok: true, taskId, ...logResult };
      return { ok: true, ignored: true, reason: 'STATUS_NOT_PUBLISHED' };
    }

    // Reuse the already-hardened reconciliation path. The webhook only wakes it immediately;
    // it does not alter the fixed Make scenario or trust the webhook payload as publication proof.
    const reconciliation = await this.publishing.reconcileClickUpWatchResults();
    return { ok: true, taskId, reconciliation };
  }

  private async notifyMakeProblemLog(taskId: string): Promise<{ handled: boolean; result?: 'ERROR' | 'WARNING'; duplicate?: boolean; delivery?: unknown }> {
    const task = await this.clickup.getTask(taskId);
    if (!task?.name) return { handled: false };
    if (task.list?.id !== undefined && env.CLICKUP_LIST_ID && String(task.list.id) !== String(env.CLICKUP_LIST_ID)) {
      return { handled: false };
    }

    const parsed = parseMakeLogName(task.name);
    if (!parsed) return { handled: false };

    const claimed = await this.store.markClickUpLogTaskProcessed(taskId);
    if (!claimed) return { handled: true, result: parsed.result, duplicate: true };

    const detail = cleanDetail(task.text_content || task.description || '');
    const title = parsed.result === 'ERROR'
      ? `فشل مسار النشر على ${parsed.platform} ❌`
      : `تحذير في مسار النشر على ${parsed.platform} ⚠️`;
    const body = detail
      ? truncate(detail, 170)
      : parsed.result === 'ERROR'
        ? `سجّل Make خطأ في مسار ${parsed.platform}. افتحي سجل النشر للتفاصيل.`
        : `سجّل Make تحذيرًا في مسار ${parsed.platform}. افتحي سجل النشر للتفاصيل.`;

    try {
      const delivery = await this.notifications.send({
        title,
        body,
        url: '/browser.html?view=logs',
        tag: `make-log-${taskId}`,
      });
      if (delivery.failed > 0 && delivery.delivered === 0) {
        await this.store.releaseClickUpLogTaskProcessed(taskId);
      }
      return { handled: true, result: parsed.result, delivery };
    } catch (error) {
      await this.store.releaseClickUpLogTaskProcessed(taskId);
      throw error;
    }
  }
}

function canonicalWebhookEndpoint(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || 'ghaith-web-content-os.vercel.app';
  const origin = /^https?:\/\//i.test(host) ? host.replace(/\/$/, '') : `https://${host.replace(/\/$/, '')}`;
  return `${origin}/api/webhooks/clickup`;
}

function parseMakeLogName(name: string): { platform: string; result: 'ERROR' | 'WARNING' } | undefined {
  const match = name.trim().match(/^\[LOG\]\s+(.+?)\s*-\s*(ERROR|WARNING)\s*$/i);
  if (!match) return undefined;
  return {
    platform: normalizePlatformLabel(match[1]!.trim()),
    result: match[2]!.toUpperCase() as 'ERROR' | 'WARNING',
  };
}

function normalizePlatformLabel(value: string): string {
  const key = value.trim().toLowerCase();
  return ({
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    pinterest: 'Pinterest',
    pintrest: 'Pinterest',
    youtube: 'YouTube',
    x: 'X',
  } as Record<string, string>)[key] ?? value.trim();
}

function cleanDetail(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function validSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const supplied = signature.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(supplied) || supplied.length !== expected.length) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(supplied, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}