import { env } from '../config/env';

export interface HeyGenConnectionProbe {
  ok: boolean;
  enabled: boolean;
  mode: 'api' | 'webhook' | 'none';
  avatarConfigured: boolean;
  voiceConfigured: boolean;
  message?: string;
}

export class HeyGenAdapter {
  get mode(): HeyGenConnectionProbe['mode'] {
    if (env.HEYGEN_API_KEY) return 'api';
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
    if (this.mode === 'none') return { ok: false, ...base, message: 'HeyGen is not configured.' };
    if (this.mode === 'webhook') return { ok: true, ...base };
    try {
      const response = await fetch(`${env.HEYGEN_API_URL}/v2/avatars`, {
        headers: { 'x-api-key': env.HEYGEN_API_KEY! },
      });
      if (!response.ok) return { ok: false, ...base, message: `HeyGen returned ${response.status}.` };
      return { ok: true, ...base };
    } catch (error) {
      return { ok: false, ...base, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async requestVideo(payload: Record<string, unknown>): Promise<unknown | undefined> {
    if (this.mode === 'none') return undefined;
    if (this.mode === 'webhook') {
      const response = await fetch(env.HEYGEN_AUTOMATION_WEBHOOK_URL!, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HeyGen automation failed: ${response.status}`);
      return response.json().catch(() => ({}));
    }

    if (!env.HEYGEN_AVATAR_ID) throw new Error('HEYGEN_AVATAR_ID is required for direct HeyGen video generation.');
    const script = typeof payload.script === 'string' ? payload.script.trim() : '';
    if (!script) throw new Error('HeyGen video generation requires a non-empty script.');

    const character = env.HEYGEN_AVATAR_TYPE === 'photo_avatar'
      ? { type: 'talking_photo', talking_photo_id: env.HEYGEN_AVATAR_ID }
      : { type: 'avatar', avatar_id: env.HEYGEN_AVATAR_ID, avatar_style: 'normal' };
    const voice: Record<string, unknown> = { type: 'text', input_text: script };
    if (env.HEYGEN_VOICE_ID) voice.voice_id = env.HEYGEN_VOICE_ID;

    const response = await fetch(`${env.HEYGEN_API_URL}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'x-api-key': env.HEYGEN_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: typeof payload.title === 'string' ? payload.title : 'Ghaith Web Content OS',
        caption: false,
        dimension: { width: 1080, height: 1920 },
        video_inputs: [{ character, voice }],
      }),
    });
    if (!response.ok) throw new Error(`HeyGen request failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { data?: { video_id?: string }; error?: unknown };
    if (!data.data?.video_id) throw new Error('HeyGen response did not include video_id.');
    return { videoId: data.data.video_id };
  }
}
