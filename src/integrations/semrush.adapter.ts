import { env } from '../config/env';

export class SemrushAdapter {
  get enabled() { return Boolean(env.SEMRUSH_API_URL && env.SEMRUSH_API_KEY); }

  async enrichKeyword(keyword: string): Promise<unknown | undefined> {
    if (!env.SEMRUSH_API_URL || !env.SEMRUSH_API_KEY) return undefined;
    const url = new URL(env.SEMRUSH_API_URL);
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('key', env.SEMRUSH_API_KEY);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Semrush request failed: ${response.status}`);
    const text = await response.text();
    try { return JSON.parse(text); } catch { return text; }
  }
}
