import { env } from '../config/env';

export interface CanvaConnectionProbe { ok: boolean; enabled: boolean; mode: 'api' | 'webhook' | 'none'; message?: string; }

export class CanvaAdapter {
  get mode(): CanvaConnectionProbe['mode'] {
    if (env.CANVA_ACCESS_TOKEN) return 'api';
    if (env.CANVA_AUTOMATION_WEBHOOK_URL) return 'webhook';
    return 'none';
  }

  get enabled() { return this.mode !== 'none'; }

  async testConnection(): Promise<CanvaConnectionProbe> {
    if (this.mode === 'none') return { ok: false, enabled: false, mode: 'none', message: 'Canva is not configured.' };
    if (this.mode === 'webhook') return { ok: true, enabled: true, mode: 'webhook' };
    try {
      const response = await fetch('https://api.canva.com/rest/v1/users/me', {
        headers: { Authorization: `Bearer ${env.CANVA_ACCESS_TOKEN}` },
      });
      if (!response.ok) return { ok: false, enabled: true, mode: 'api', message: `Canva returned ${response.status}.` };
      return { ok: true, enabled: true, mode: 'api' };
    } catch (error) {
      return { ok: false, enabled: true, mode: 'api', message: error instanceof Error ? error.message : String(error) };
    }
  }

  async requestDesign(payload: Record<string, unknown>): Promise<unknown | undefined> {
    if (this.mode === 'none') return undefined;
    if (this.mode === 'webhook') {
      const response = await fetch(env.CANVA_AUTOMATION_WEBHOOK_URL!, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Canva automation failed: ${response.status}`);
      return response.json().catch(() => ({}));
    }

    const platforms = Array.isArray(payload.platforms) ? payload.platforms.map(String) : [];
    const size = platforms.includes('pinterest')
      ? { width: 1000, height: 1500 }
      : platforms.includes('instagram')
        ? { width: 1080, height: 1350 }
        : { width: 1080, height: 1080 };
    const response = await fetch('https://api.canva.com/rest/v1/designs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CANVA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'type_and_asset',
        design_type: { type: 'custom', ...size },
        title: typeof payload.title === 'string' ? payload.title : 'Ghaith Web Content OS',
      }),
    });
    if (!response.ok) throw new Error(`Canva design creation failed: ${response.status} ${await response.text()}`);
    return response.json();
  }
}
