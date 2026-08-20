import { env } from '../config/env';

export interface HeyGenConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'webhook' | 'none';
  avatarConfigured: boolean;
  voiceConfigured: boolean;
  message?: string;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connection_test', source: 'ghaith-web-content-os' }),
      });
      if (!response.ok) return { ok: false, ...base, message: `HeyGen automation returned ${response.status}.` };
      return { ok: true, ...base };
    } catch (error) {
      return { ok: false, ...base, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async requestVideo(payload: Record<string, unknown>): Promise<unknown | undefined> {
    if (this.mode === 'none') return undefined;
    const response = await fetch(env.HEYGEN_AUTOMATION_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_presenter_video', ...payload }),
    });
    if (!response.ok) throw new Error(`HeyGen automation failed: ${response.status}`);
    return response.json().catch(() => ({}));
  }
}
