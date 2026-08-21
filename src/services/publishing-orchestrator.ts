import { createHash } from 'node:crypto';
import type { ContentItem, PublicationLog, PublishRequest, PublishResult } from '../core/types';
import { AppError } from '../core/errors';
import { Store } from '../repositories/store';
import { ApprovalService } from './approval.service';
import { PlatformRegistry } from '../platforms/registry';
import { ClickUpAdapter } from '../integrations/clickup.adapter';
import { GoogleDriveFileReader } from '../integrations/google-drive-file-reader';
import { env } from '../config/env';
import { buildClickUpWatchPlans } from './clickup-watch-contract';

export class PublishingOrchestrator {
  private readonly driveFiles: GoogleDriveFileReader;

  constructor(
    private readonly store: Store,
    private readonly approval: ApprovalService,
    private readonly platforms = new PlatformRegistry(),
    private readonly clickup = new ClickUpAdapter(),
    driveFiles?: GoogleDriveFileReader,
  ) {
    this.driveFiles = driveFiles ?? new GoogleDriveFileReader(store);
  }

  async publish(contentId: string) {
    const content = await this.store.getContent(contentId);
    this.approval.ensureReady(content);
    if (content.platforms.length === 0) throw new AppError('Content has no target platforms.', 400);

    // Ghaith Web's practical publishing mode: ClickUp task prefixes are the Make router trigger.
    // Never expose [FB]/[IG]/[TT]/[PIN]/[YT] until every target task has passed preflight and has its media attached.
    if (env.PUBLISH_MODE === 'clickup_watch') {
      if (!this.clickup.enabled) {
        return {
          contentId,
          published: false,
          dispatched: false,
          mode: 'clickup_watch',
          warning: 'ClickUp is not connected. Configure CLICKUP_API_TOKEN; the canonical list ID is already built in.',
          results: [],
        };
      }

      // Pure preflight happens before any ClickUp mutation. X/future platforms are rejected here until Make has a route.
      const plans = buildClickUpWatchPlans(content);
      const taskIds: Record<string, string> = { ...(content.clickupTaskIds ?? {}) };

      // Stage every task behind a neutral HOLD name. Make's current router cannot match these names.
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
          // A task without the expected attachment must never become routable by Make.
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

      // Only now reveal the platform prefix and READY status. Name + description + status are one ClickUp update.
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
        message: 'Platform-specific ClickUp tasks passed preflight, received media, and are now READY for the fixed Make Watch Tasks scenario.',
        tasks: plans.map((plan) => ({ platform: plan.platform, taskId: taskIds[plan.platform] })),
        results: [],
      };
    }

    if (env.PUBLISH_MODE !== 'webhook') {
      throw new AppError(`Unsupported PUBLISH_MODE: ${env.PUBLISH_MODE}`, 500, 'CONFIG_ERROR');
    }

    const results: PublicationLog[] = [];
    let hadDryRun = false;

    for (const platform of content.platforms) {
      const normalizedPlatform = platform.toLowerCase();
      const key = idempotencyKey(content.id, normalizedPlatform, content.revision);
      const previous = await this.store.findSuccessfulLog(key);
      if (previous) { results.push(previous); continue; }

      const payload: PublishRequest = {
        contentId: content.id,
        clickupTaskId: platformTaskId(content, normalizedPlatform),
        platform: normalizedPlatform,
        title: content.title,
        caption: content.package.caption,
        description: content.package.description,
        mediaUrls: [...content.assets.map((a) => a.url), ...content.googleDriveUrls],
        mediaType: content.contentType,
        status: content.status,
        idempotencyKey: key,
      };

      try {
        const response = await this.platforms.get(normalizedPlatform).publish(payload);
        hadDryRun ||= Boolean(response.dryRun);
        const result = response.success ? (response.warning ? 'WARNING' : 'SUCCESS') : 'ERROR';
        results.push(await this.store.addLog({
          contentId: content.id,
          platform: normalizedPlatform,
          result,
          originalTaskId: platformTaskId(content, normalizedPlatform),
          makeExecutionId: response.executionId,
          attempt: 1,
          publicUrl: response.publicUrl,
          errorMessage: response.warning,
          processed: true,
          idempotencyKey: key,
        }));
      } catch (error) {
        results.push(await this.store.addLog({
          contentId: content.id,
          platform: normalizedPlatform,
          result: 'ERROR',
          originalTaskId: platformTaskId(content, normalizedPlatform),
          attempt: env.PUBLISH_MAX_RETRIES + 1,
          errorMessage: error instanceof Error ? error.message : String(error),
          processed: true,
          idempotencyKey: key,
        }));
      }
    }

    const allCompleted = results.every((x) => x.result === 'SUCCESS' || x.result === 'WARNING');
    const livePublished = allCompleted && !hadDryRun;
    if (livePublished) {
      const updated = await this.store.updateContent(content.id, { status: 'PUBLISHED', publishedAt: new Date().toISOString() });
      await markClickUpTasksPublished(updated, this.clickup);
    }

    return { contentId, published: livePublished, dryRun: hadDryRun, mode: 'webhook', results };
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
    const log = await this.store.addLog({
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

    const logs = (await this.store.listLogs()).filter((x) => x.contentId === content.id);
    const platformDone = (p: string) => logs.some((x) => x.platform.toLowerCase() === p.toLowerCase() && (x.result === 'SUCCESS' || x.result === 'WARNING'));
    const allDone = content.platforms.every(platformDone);
    if (allDone && content.status !== 'PUBLISHED') {
      const updated = await this.store.updateContent(content.id, { status: 'PUBLISHED', publishedAt: new Date().toISOString() });
      await markClickUpTasksPublished(updated, this.clickup);
    }
    return { log, content: await this.store.getContent(content.id) };
  }
}

function idempotencyKey(contentId: string, platform: string, revision: number): string {
  return createHash('sha256').update(`${contentId}:${platform.toLowerCase()}:${revision}`).digest('hex');
}

function platformTaskId(content: ContentItem, platform: string): string | undefined {
  return content.clickupTaskIds?.[platform.toLowerCase()] ?? content.clickupTaskId;
}

async function markClickUpTasksPublished(content: ContentItem, clickup: ClickUpAdapter): Promise<void> {
  if (!clickup.enabled) return;
  const ids = new Set<string>([
    ...Object.values(content.clickupTaskIds ?? {}),
    ...(content.clickupTaskId ? [content.clickupTaskId] : []),
  ]);
  for (const id of ids) await clickup.updateStatus(id, env.CLICKUP_STATUS_PUBLISHED);
}
