import { env } from '../config/env';

export class CanvaAdapter {
  get enabled() { return Boolean(env.CANVA_AUTOMATION_WEBHOOK_URL); }

  async requestDesign(payload: Record<string, unknown>): Promise<unknown | undefined> {
    if (!env.CANVA_AUTOMATION_WEBHOOK_URL) return undefined;
    const response = await fetch(env.CANVA_AUTOMATION_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Canva automation failed: ${response.status}`);
    return response.json().catch(() => ({}));
  }
}
