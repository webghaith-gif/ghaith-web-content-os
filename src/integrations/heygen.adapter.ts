import { env } from '../config/env';

export interface HeyGenConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'webhook' | 'none';
  avatarConfigured: boolean;
  voiceConfigured: boolean;
  message?: string;
}

export interface HeyGenAutomationResult {
  jobId?: string;
  videoId?: string;
  videoUrl?: string;
  status?: string;
  raw: unknown;
}

export class HeyGenAdapter {
  get mode(): HeyGenConnectionProbe['mode'] {
    if (env.HEYGEN_AUTOMATION_WEBHOOK_URL) return 'webhook';
    return 'none';
  }

  get enabled() { return this.mode !== 'none'; }

  async testConnection(): Promise<HeyGenConnectionProbe> {
    const base = {
      enabled: this.enabled,
      mode: this.mode,
      avatarConfigured: Boolean(env.HEYGEN_AVATAR_ID),
      voiceConfigured: Boolean(env.HEYGEN_VOICE_ID),
    } as const;
    if (this.mode === 'none') {
      return {
        ok: false,
        ...base,
        message: env.HEYGEN_API_KEY
          ? 'A legacy HeyGen API key was found but is intentionally not used. Configure HEYGEN_AUTOMATION_WEBHOOK_URL.'
          : 'HeyGen automation webhook is not configured.',
      };
    }
    try {
      const response = await fetch(env.HEYGEN_AUTOMATION_WEBHOOK_URL!, {
        method: 'POST',
        headers: webhookHeaders(),
        body: JSON.stringify({ action: 'connection_test', source: 'ghaith-web-content-os' }),
      });
      if (!response.ok) return { ok: false, ...base, message: `HeyGen automation returned ${response.status}.` };
      return { ok: true, ...base };
    } catch (error) {
      return { ok: false, ...base, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async requestVideo(payload: Record<string, unknown>): Promise<HeyGenAutomationResult | undefined> {
    if (this.mode === 'none') return undefined;
    const script = typeof payload.script === 'string' ? payload.script.trim() : '';
    if (!script) throw new Error('HeyGen automation requires a non-empty script.');
    const response = await fetch(env.HEYGEN_AUTOMATION_WEBHOOK_URL!, {
      method: 'POST',
      headers: webhookHeaders(),
      body: JSON.stringify({
        action: 'generate_presenter_video',
        callbackUrl: `${env.APP_BASE_URL.replace(/\/$/, '')}/api/webhooks/heygen`,
        ...payload,
      }),
    });
    if (!response.ok) throw new Error(`HeyGen automation failed: ${response.status}`);
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    return {
      jobId: pickString(raw, 'jobId', 'job_id', 'executionId'),
      videoId: pickString(raw, 'videoId', 'video_id'),
      videoUrl: pickString(raw, 'videoUrl', 'video_url'),
      status: pickString(raw, 'status'),
      raw,
    };
  }
}

function webhookHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(env.HEYGEN_AUTOMATION_WEBHOOK_SECRET ? { 'X-Ghaith-Webhook-Secret': env.HEYGEN_AUTOMATION_WEBHOOK_SECRET } : {}),
  };
}

function pickString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  return undefined;
}
