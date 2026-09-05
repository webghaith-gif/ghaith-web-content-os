import { createHash } from 'node:crypto';
import type { AssetRef, ContentItem, PublicationLog, PublishRequest, PublishResult } from '../core/types';
import { AppError } from '../core/errors';
import { Store } from '../repositories/store';
import { ApprovalService } from './approval.service';
import { NotificationService, type AppNotification } from './notification.service';
import { PlatformRegistry } from '../platforms/registry';
import { ClickUpAdapter } from '../integrations/clickup.adapter';
import { GoogleDriveFileReader } from '../integrations/google-drive-file-reader';
import { env } from '../config/env';
import { buildClickUpWatchPlans } from './clickup-watch-contract';
import { DriveViewerService } from './drive-viewer.service';
import { buildPlatformPublishingPlan } from './publishing-media';

export class PublishingOrchestrator {
  private readonly driveFiles: GoogleDriveFileReader;
  private readonly driveViewer: DriveViewerService;
  private readonly notifications: NotificationService;

  constructor(
    private readonly store: Store,
    private readonly approval: ApprovalService,
    private readonly platforms = new PlatformRegistry(),
    private readonly clickup = new ClickUpAdapter(),
    driveFiles?: GoogleDriveFileReader,
  ) {
    this.driveFiles = driveFiles ?? new GoogleDriveFileReader(store);
    this.driveViewer = new DriveViewerService(store);
    this.notifications = new NotificationService(store);
  }

  async publish(contentId: string) {
    const content = await this.store.getContent(contentId);
    this.approval.ensureReady(content);
    if (content.platforms.length === 0) throw new AppError('Content has no target platforms.', 400);

    const publishMode = await this.publishMode();

    // Legacy/fallback path. The canonical path is now direct webhook and does not require ClickUp.
    if (publishMode === 'clickup_watch') {
      if (!this.clickup.enabled) {
        return {
          contentId,
          published: false,
          dispatched: false,
          mode: 'clickup_watch',
          warning: 'ClickUp is not connected. Switch to webhook mode or configure ClickUp.',
          results: [],
        };
      }

      const plans = buildClickUpWatchPlans(content);
      const taskIds: Record<string, string> = { ...(content.clickupTaskIds ?? {}) };

      for (const plan of plans) {
        if (taskIds[plan.platform]) continue;

        const task = await this.clickup.createContentTask(plan.holdName, plan.description, env.CLICKUP_STATUS_IN_REVIEW);
        if (!task?.id) throw new AppError(`ClickUp did not create a task for ${plan.platform}.`, 502, 'CLICKUP_HANDOFF_FAILED');

        try {
          const driveBacked = Boolean(
            plan.asset.providerId
            && (plan.asset.provider === 'google-drive' || plan.asset.provider === 'remotion'),
          );
          if (driveBacked) {
            const file = await this.driveFiles.download(plan.asset.providerId!);
            await this.clickup.attachTaskFile(task.id, file.bytes, plan.fileName || file.name || 'ghaith-web-asset', file.mimeType);
          } else {
            await this.clickup.attachTaskFileFromUrl(task.id, plan.asset.url, plan.fileName);
          }
        } catch (error) {
          try { await this.clickup.updateStatus(task.id, 'archived'); } catch { /* best-effort quarantine */ }
          throw new AppError(
            `Failed to attach ${plan.platform} media: ${error instanceof Error ? error.message : String(error)}`,
            502,
            'CLICKUP_ATTACHMENT_FAILED',
          );
        }

        taskIds[plan.platform] = task.id;
        await this.store.updateContent(content.id, {
          clickupTaskIds: { ...taskIds },
          clickupTaskId: content.clickupTaskId ?? task.id,
        });
      }

      for (const plan of plans) {
        const taskId = taskIds[plan.platform];
        if (!taskId) throw new AppError(`Missing staged ClickUp task for ${plan.platform}.`, 500, 'CLICKUP_HANDOFF_FAILED');
        await this.clickup.finalizeTask(taskId, plan.finalName, plan.description, env.CLICKUP_STATUS_READY);
      }

      return {
        contentId,
        published: false,
        dispatched: true,
        mode: 'clickup_watch',
        message: 'Platform-specific ClickUp tasks are READY for the legacy Make route.',
        tasks: plans.map((plan) => ({ platform: plan.platform, taskId: taskIds[plan.platform] })),
        results: [],
      };
    }

    if (publishMode !== 'webhook') {
      throw new AppError(`Unsupported PUBLISH_MODE: ${publishMode}`, 500, 'CONFIG_ERROR');
    }

    const results: PublicationLog[] = [];
    let hadDryRun = false;

    for (const platform of content.platforms) {
      const normalizedPlatform = platform.trim().toLowerCase();
      const key = idempotencyKey(content.id, normalizedPlatform, content.revision);
      const previous = await this.store.findSuccessfulLog(key);
      if (previous) { results.push(previous); continue; }

      try {
        const plan = buildPlatformPublishingPlan(content, normalizedPlatform);
        const variant = content.package.platformCopies?.[normalizedPlatform];
        const mediaItems = plan.assets.map((asset) => ({
          url: this.publicMediaUrl(asset),
          kind: asset.kind as 'image' | 'video',
        }));
        const payload: PublishRequest = {
          contentId: content.id,
          platform: normalizedPlatform,
          title: variant?.title?.trim() || content.title,
          caption: variant?.caption?.trim() || content.package.caption,
          description: variant?.description?.trim() || content.package.description,
          mediaUrls: mediaItems.map((item) => item.url),
          mediaItems,
          mediaMode: plan.mediaMode,
          mediaType: content.contentType,
          status: content.status,
          idempotencyKey: key,
        };

        const response = await this.platforms.get(normalizedPlatform).publish(payload);
        hadDryRun ||= Boolean(response.dryRun);
        const result = response.success ? (response.warning ? 'WARNING' : 'SUCCESS') : 'ERROR';
        const outcome = await this.store.addLogWithOutcome({
          contentId: content.id,
          platform: normalizedPlatform,
          result,
          makeExecutionId: response.executionId,
          attempt: 1,
          publicUrl: response.publicUrl,
          errorMessage: response.warning,
          processed: true,
          idempotencyKey: key,
        });
        results.push(outcome.log);
        if (outcome.created) await this.notifyPublicationLog(content, outcome.log);
      } catch (error) {
        const outcome = await this.store.addLogWithOutcome({
          contentId: content.id,
          platform: normalizedPlatform,
          result: 'ERROR',
          attempt: env.PUBLISH_MAX_RETRIES + 1,
          errorMessage: error instanceof Error ? error.message : String(error),
          processed: true,
          idempotencyKey: key,
        });
        results.push(outcome.log);
        if (outcome.created) await this.notifyPublicationLog(content, outcome.log);
      }
    }

    const allCompleted = results.length === content.platforms.length
      && results.every((x) => x.result === 'SUCCESS' || x.result === 'WARNING');
    const livePublished = allCompleted && !hadDryRun;
    if (livePublished) {
      const transition = await this.store.markContentPublished(content.id);
      if (transition.changed) {
        // ClickUp is optional in webhook mode. Existing historical task links are mirrored only when present.
        await markClickUpTasksPublished(transition.content, this.clickup);
        await this.notifyContentPublished(transition.content);
      }
    }

    return { contentId, published: livePublished, dryRun: hadDryRun, mode: 'webhook', results };
  }

  async reconcileClickUpWatchResults() {
    if (await this.publishMode() !== 'clickup_watch' || !this.clickup.enabled) {
      return { checkedTasks: 0, publishedContents: 0, syncedLogs: 0, failures: [] as string[] };
    }

    const candidates = (await this.store.listContents()).filter((content) =>
      content.status === 'READY'
      && Boolean(content.clickupTaskId || Object.keys(content.clickupTaskIds ?? {}).length),
    );

    let checkedTasks = 0;
    let publishedContents = 0;
    let syncedLogs = 0;
    const failures: string[] = [];
    const expectedStatus = env.CLICKUP_STATUS_PUBLISHED.trim().toLowerCase();

    for (const content of candidates) {
      const targets = [...new Set(content.platforms.map((platform) => platform.trim().toLowerCase()).filter(Boolean))];
      if (targets.length === 0) continue;

      let allPublished = true;
      for (const platform of targets) {
        const taskId = reconciliationTaskId(content, platform, targets.length);
        if (!taskId) {
          allPublished = false;
          failures.push(`${content.id}:${platform}:missing-task`);
          continue;
        }

        try {
          const task = await this.clickup.getTask(taskId);
          checkedTasks += 1;
          const rawStatus = typeof task?.status === 'string' ? task.status : task?.status?.status;
          const isPublished = rawStatus?.trim().toLowerCase() === expectedStatus;
          if (!isPublished) {
            allPublished = false;
            continue;
          }

          const key = idempotencyKey(content.id, platform, content.revision);
          const outcome = await this.store.addLogWithOutcome({
            contentId: content.id,
            platform,
            result: 'SUCCESS',
            originalTaskId: taskId,
            attempt: 1,
            processed: true,
            idempotencyKey: key,
          });
          if (outcome.created) {
            syncedLogs += 1;
            await this.notifyPublicationLog(content, outcome.log);
          }
        } catch (error) {
          allPublished = false;
          failures.push(`${content.id}:${platform}:${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (allPublished) {
        const transition = await this.store.markContentPublished(content.id, content.publishedAt ?? new Date().toISOString());
        if (transition.changed) {
          publishedContents += 1;
          await this.notifyContentPublished(transition.content);
        }
      }
    }

    return { checkedTasks, publishedContents, syncedLogs, failures };
  }

  async recordMakeResult(input: {
    contentId: string;
    platform: string;
    result: PublishResult;
    publicUrl?: string;
    executionId?: string;
    attempt?: number;
    errorCode?: string;
    errorMessage?: string;
  }) {
    const content = await this.store.getContent(input.contentId);
    const platform = input.platform.toLowerCase();
    if (!content.platforms.map((x) => x.toLowerCase()).includes(platform)) {
      throw new AppError(`Platform ${platform} is not a target for this content.`, 400, 'VALIDATION_ERROR');
    }

    const key = idempotencyKey(content.id, platform, content.revision);
    const outcome = await this.store.addLogWithOutcome({
      contentId: content.id,
      platform,
      result: input.result,
      originalTaskId: platformTaskId(content, platform),
      makeExecutionId: input.executionId,
      attempt: input.attempt ?? 1,
      publicUrl: input.publicUrl,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      processed: true,
      idempotencyKey: key,
    });
    if (outcome.created) await this.notifyPublicationLog(content, outcome.log);

    const logs = (await this.store.listLogs()).filter((x) => x.contentId === content.id);
    const platformDone = (p: string) => logs.some((x) => x.platform.toLowerCase() === p.toLowerCase() && (x.result === 'SUCCESS' || x.result === 'WARNING'));
    const allDone = content.platforms.every(platformDone);
    if (allDone) {
      const transition = await this.store.markContentPublished(content.id);
      if (transition.changed) {
        await markClickUpTasksPublished(transition.content, this.clickup);
        await this.notifyContentPublished(transition.content);
      }
    }
    return { log: outcome.log, content: await this.store.getContent(content.id) };
  }

  private async publishMode(): Promise<string> {
    const runtime = await this.store.getPublishingRuntime();
    return (runtime?.mode ?? env.PUBLISH_MODE).trim().toLowerCase();
  }

  private publicMediaUrl(asset: AssetRef): string {
    if (asset.providerId && (asset.provider === 'google-drive' || asset.provider === 'remotion')) {
      const relative = this.driveViewer.linkForFileId(asset.providerId);
      if (!relative) throw new AppError('Could not create a signed Drive media URL for publishing.', 503, 'PUBLISHING_MEDIA_URL_FAILED');
      return new URL(relative, publicAppBaseUrl()).toString();
    }
    return asset.url;
  }

  private async notifyPublicationLog(content: ContentItem, log: PublicationLog): Promise<void> {
    const platform = platformLabel(log.platform);
    const detail = log.errorMessage?.trim();
    const body = detail ? `${content.title} — ${truncate(detail, 150)}` : content.title;
    const title = log.result === 'SUCCESS'
      ? `اكتمل مسار النشر على ${platform} ✅`
      : log.result === 'WARNING'
        ? `مسار النشر على ${platform} يحتاج انتباهًا ⚠️`
        : `تعذر مسار النشر على ${platform} ❌`;
    await this.safeNotify({
      title,
      body,
      url: '/browser.html?view=logs',
      tag: `publish-${content.id}-${log.platform}-${log.result}-${content.revision}-${log.attempt}`,
    });
  }

  private async notifyContentPublished(content: ContentItem): Promise<void> {
    const platforms = [...new Set(content.platforms.map(platformLabel))].join('، ');
    await this.safeNotify({
      title: 'اكتملت جميع مسارات النشر 🎉',
      body: `${content.title}${platforms ? ` — ${platforms}` : ''}`,
      url: '/browser.html?view=content',
      tag: `content-published-${content.id}-${content.revision}`,
    });
  }

  private async safeNotify(notification: AppNotification): Promise<void> {
    try { await this.notifications.send(notification); }
    catch (error) { console.warn('Publication notification delivery failed', error); }
  }
}

function idempotencyKey(contentId: string, platform: string, revision: number): string {
  return createHash('sha256').update(`${contentId}:${platform.toLowerCase()}:${revision}`).digest('hex');
}

function platformTaskId(content: ContentItem, platform: string): string | undefined {
  return content.clickupTaskIds?.[platform.toLowerCase()] ?? content.clickupTaskId;
}

function reconciliationTaskId(content: ContentItem, platform: string, targetCount: number): string | undefined {
  return content.clickupTaskIds?.[platform.toLowerCase()] ?? (targetCount === 1 ? content.clickupTaskId : undefined);
}

function publicAppBaseUrl(): string {
  const configured = env.APP_BASE_URL.trim();
  if (configured && !/^https?:\/\/localhost(?::\d+)?\/?$/i.test(configured)) return configured;
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (production) return production.startsWith('http') ? production : `https://${production}`;
  return configured || 'http://localhost:3000';
}

function platformLabel(platform: string): string {
  const key = platform.trim().toLowerCase();
  return ({
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    pinterest: 'Pinterest',
    youtube: 'YouTube',
    x: 'X',
  } as Record<string, string>)[key] ?? platform;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

async function markClickUpTasksPublished(content: ContentItem, clickup: ClickUpAdapter): Promise<void> {
  if (!clickup.enabled) return;
  const ids = new Set<string>([
    ...Object.values(content.clickupTaskIds ?? {}),
    ...(content.clickupTaskId ? [content.clickupTaskId] : []),
  ]);
  for (const id of ids) await clickup.updateStatus(id, env.CLICKUP_STATUS_PUBLISHED);
}
