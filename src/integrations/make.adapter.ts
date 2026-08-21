import { env } from '../config/env';
import type { PublishRequest, PublishResponse } from '../core/types';
import { fetchJson } from '../utils/http';

/**
 * Backward-compatible webhook publisher.
 *
 * The class keeps its historical name so existing imports do not break, but the
 * configured endpoint is now vendor-neutral: Make, n8n, or any compatible HTTP
 * workflow can receive the same normalized publishing payload.
 *
 * When a webhook secret is configured we send both the vendor-neutral
 * X-Ghaith-Webhook-Secret header and Make's x-make-apikey header. This keeps
 * existing receivers compatible while allowing a Make Custom Webhook protected
 * with API Key authentication to accept the same secret.
 */
export class MakeAdapter {
  get enabled() { return Boolean(env.PUBLISH_WEBHOOK_URL); }

  async publish(payload: PublishRequest): Promise<PublishResponse> {
    if (!env.PUBLISH_WEBHOOK_URL) {
      return {
        success: true,
        platform: payload.platform,
        warning: 'DRY_RUN: PUBLISH_WEBHOOK_URL (or legacy MAKE_WEBHOOK_URL) not configured.',
        dryRun: true,
      };
    }

    const result = await fetchJson<Record<string, unknown>>(
      env.PUBLISH_WEBHOOK_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.PUBLISH_WEBHOOK_SECRET
            ? {
                'X-Ghaith-Webhook-Secret': env.PUBLISH_WEBHOOK_SECRET,
                'x-make-apikey': env.PUBLISH_WEBHOOK_SECRET,
              }
            : {}),
        },
        body: JSON.stringify(payload),
      },
      env.PUBLISH_MAX_RETRIES,
      env.PUBLISH_RETRY_BASE_MS,
    );

    return {
      success: result.success !== false,
      platform: payload.platform,
      publicUrl: typeof result.publicUrl === 'string' ? result.publicUrl : undefined,
      executionId: typeof result.executionId === 'string' ? result.executionId : undefined,
      warning: typeof result.warning === 'string' ? result.warning : undefined,
      raw: result,
    };
  }
}
