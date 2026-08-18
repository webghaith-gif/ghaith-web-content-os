import { env } from '../config/env';

export interface SemrushConnectionProbe { ok: boolean; enabled: boolean; country: string; message?: string; }

export class SemrushAdapter {
  get enabled() { return Boolean(env.SEMRUSH_API_KEY); }

  configuration(): SemrushConnectionProbe {
    return {
      ok: this.enabled,
      enabled: this.enabled,
      country: env.SEMRUSH_COUNTRY,
      ...(!this.enabled ? { message: 'Semrush is not configured.' } : {}),
    };
  }

  async enrichKeyword(keyword: string): Promise<unknown | undefined> {
    if (!env.SEMRUSH_API_KEY) return undefined;
    const url = new URL(env.SEMRUSH_API_URL);
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('country', env.SEMRUSH_COUNTRY);
    url.searchParams.set('format', 'json');
    const headers: Record<string, string> = {};
    headers.Authorization = ['Apikey', env.SEMRUSH_API_KEY].join(' ');
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Semrush request failed: ${response.status} ${await response.text()}`);
    return response.json();
  }
}
