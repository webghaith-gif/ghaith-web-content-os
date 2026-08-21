import { env } from '../config/env';
import type { PublishRequest, PublishResponse } from '../core/types';
import { fetchJson } from '../utils/http';

export interface MakeConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'webhook' | 'disabled';
  message?: string;
}

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

  async testConnection(): Promise<MakeConnectionProbe> {
    if (!env.PUBLISH_WEBHOOK_URL) {
      return {
        ok: false,
        enabled: false,
        mode: 'disabled',
        message: 'PUBLISH_WEBHOOK_URL is not configured.',
      };
    }

    try {
      const response = await fetch(env.PUBLISH_WEBHOOK_URL, {
        method: 'POST',
        headers: webhookHeaders(),
        body: JSON.stringify({
          action: 'connection_test',
          source: 'ghaith-web-content-os',
          sentAt: new Date().toISOString(),
        }),
      });

      const text = await response.text().catch(() => '');
      if (!response.ok) {
        return {
          ok: false,
          enabled: true,
          mode: 'webhook',
          message: `Make webhook returned HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ''}`,
        };
      }

      return {
        ok: true,
        enabled: true,
        mode: 'webhook',
        message: `Make webhook accepted the authenticated test request (HTTP ${response.status}).`,
      };
    } catch (error) {
      return {
        ok: false,
        enabled: true,
        mode: 'webhook',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

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
        headers: webhookHeaders(),
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

function webhookHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(env.PUBLISH_WEBHOOK_SECRET
      ? {
          'X-Ghaith-Webhook-Secret': env.PUBLISH_WEBHOOK_SECRET,
          'x-make-apikey': env.PUBLISH_WEBHOOK_SECRET,
        }
      : {}),
  };
}
