import { createHash } from 'node:crypto';
import type { PublicationLog, PublishRequest, PublishResult } from '../core/types';
import { AppError } from '../core/errors';
import { Store } from '../repositories/store';
import { ApprovalService } from './approval.service';
import { PlatformRegistry } from '../platforms/registry';
import { ClickUpAdapter } from '../integrations/clickup.adapter';
import { env } from '../config/env';

export class PublishingOrchestrator {
  constructor(
    private readonly store: Store,
    private readonly approval: ApprovalService,
    private readonly platforms = new PlatformRegistry(),
    private readonly clickup = new ClickUpAdapter(),
  ) {}

  async publish(contentId: string) {
    const content = await this.store.getContent(contentId);
    this.approval.ensureReady(content);
    if (content.platforms.length === 0) throw new AppError('Content has no target platforms.', 400);

    // This is the default because it mirrors the real Ghaith Web workflow:
    // approving the ClickUp task to READY is the handoff; Make Watch Tasks takes it from there.
    if (env.PUBLISH_MODE === 'clickup_watch') {
      if (!content.clickupTaskId || !this.clickup.enabled) {
        return {
          contentId,
          published: false,
          dispatched: false,
          mode: 'clickup_watch',
          warning: 'ClickUp is not connected or this content has no ClickUp task. Configure CLICKUP_API_TOKEN and CLICKUP_LIST_ID first.',
          results: [],
        };
      }
      await this.clickup.updateStatus(content.clickupTaskId, env.CLICKUP_STATUS_READY);
      return {
        contentId,
        published: false,
        dispatched: true,
        mode: 'clickup_watch',
        message: 'Content is READY in ClickUp. The existing Make Watch Tasks scenario can pick it up.',
        results: [],
      };
    }

    if (env.PUBLISH_MODE !== 'webhook') {
      throw new AppError(`Unsupported PUBLISH_MODE: ${env.PUBLISH_MODE}`, 500, 'CONFIG_ERROR');
    }

    const results: PublicationLog[] = [];
    let hadDryRun = false;

    for (const platform of content.platforms) {
      const key = idempotencyKey(content.id, platform, content.revision);
      const previous = await this.store.findSuccessfulLog(key);
      if (previous) { results.push(previous); continue; }

      const payload: PublishRequest = {
        contentId: content.id,
        clickupTaskId: content.clickupTaskId,
        platform,
        title: content.title,
        caption: content.package.caption,
        description: content.package.description,
        mediaUrls: [...content.assets.map((a) => a.url), ...content.googleDriveUrls],
        mediaType: content.contentType,
        status: content.status,
        idempotencyKey: key,
      };

      try {
        const response = await this.platforms.get(platform).publish(payload);
        hadDryRun ||= Boolean(response.dryRun);
        const result = response.success ? (response.warning ? 'WARNING' : 'SUCCESS') : 'ERROR';
        results.push(await this.store.addLog({
          contentId: content.id,
          platform,
          result,
          originalTaskId: content.clickupTaskId,
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
          platform,
          result: 'ERROR',
          originalTaskId: content.clickupTaskId,
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
      if (updated.clickupTaskId) await this.clickup.updateStatus(updated.clickupTaskId, env.CLICKUP_STATUS_PUBLISHED);
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
      originalTaskId: content.clickupTaskId,
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
      if (updated.clickupTaskId && this.clickup.enabled) await this.clickup.updateStatus(updated.clickupTaskId, env.CLICKUP_STATUS_PUBLISHED);
    }
    return { log, content: await this.store.getContent(content.id) };
  }
}

function idempotencyKey(contentId: string, platform: string, revision: number): string {
  return createHash('sha256').update(`${contentId}:${platform.toLowerCase()}:${revision}`).digest('hex');
}
