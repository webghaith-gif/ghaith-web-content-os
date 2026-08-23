import { env } from '../config/env';
import type { PublishRequest, PublishResponse } from '../core/types';
import { createDatabase } from '../repositories/database-factory';
import { Store } from '../repositories/store';
import { fetchJson } from '../utils/http';

export interface MakeConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'webhook' | 'disabled';
  message?: string;
}

/** Vendor-neutral direct publishing webhook bridge (Make, n8n, or compatible HTTP workflow). */
export class MakeAdapter {
  private readonly store: Store;

  constructor(store?: Store) {
    this.store = store ?? new Store(createDatabase());
  }

  /** The bridge is runtime-configurable from persistent state; testConnection verifies the actual endpoint. */
  get enabled() { return true; }

  async isEnabled(): Promise<boolean> {
    return Boolean((await this.runtime()).url);
  }

  async testConnection(): Promise<MakeConnectionProbe> {
    const config = await this.runtime();
    if (!config.url) {
      return {
        ok: false,
        enabled: false,
        mode: 'disabled',
        message: 'Direct publishing webhook is not configured.',
      };
    }

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: webhookHeaders(config.secret),
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
          message: `Publishing webhook returned HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ''}`,
        };
      }

      return {
        ok: true,
        enabled: true,
        mode: 'webhook',
        message: `Publishing webhook accepted the test request (HTTP ${response.status}).`,
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
    const config = await this.runtime();
    if (!config.url) {
      return {
        success: true,
        platform: payload.platform,
        warning: 'DRY_RUN: direct publishing webhook is not configured.',
        dryRun: true,
      };
    }

    const result = await fetchJson<Record<string, unknown>>(
      config.url,
      {
        method: 'POST',
        headers: webhookHeaders(config.secret),
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

  private async runtime(): Promise<{ url?: string; secret?: string }> {
    const persisted = await this.store.getPublishingRuntime();
    return {
      url: persisted?.webhookUrl?.trim() || env.PUBLISH_WEBHOOK_URL,
      secret: persisted?.webhookSecret?.trim() || env.PUBLISH_WEBHOOK_SECRET,
    };
  }
}

function webhookHeaders(secret?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(secret
      ? {
          'X-Ghaith-Webhook-Secret': secret,
          'x-make-apikey': secret,
        }
      : {}),
  };
}
