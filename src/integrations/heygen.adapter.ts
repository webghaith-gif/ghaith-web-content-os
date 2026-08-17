import { env } from '../config/env';

export class HeyGenAdapter {
  get enabled() { return Boolean(env.HEYGEN_AUTOMATION_WEBHOOK_URL); }

  async requestVideo(payload: Record<string, unknown>): Promise<unknown | undefined> {
    if (!env.HEYGEN_AUTOMATION_WEBHOOK_URL) return undefined;
    const response = await fetch(env.HEYGEN_AUTOMATION_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HeyGen automation failed: ${response.status}`);
    return response.json().catch(() => ({}));
  }
}
