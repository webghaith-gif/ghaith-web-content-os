import { env } from '../config/env';

export interface SemrushConnectionProbe { ok: boolean; enabled: boolean; country: string; message?: string; }
export interface SemrushKeywordMetrics {
  keyword: string;
  country: string;
  searchVolume?: number;
  keywordDifficulty?: number;
  competitiveDensity?: number;
  cpcUsdCents?: number;
  intents?: string[];
  trends?: number[];
  fetchedAt: string;
}

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

  async enrichKeyword(keyword: string): Promise<SemrushKeywordMetrics | undefined> {
    if (!env.SEMRUSH_API_KEY) return undefined;
    const normalizedKeyword = keyword.replace(/\s+/g, ' ').trim().slice(0, 255);
    if (!normalizedKeyword) return undefined;
    const url = new URL(env.SEMRUSH_API_URL);
    url.searchParams.set('keyword', normalizedKeyword);
    url.searchParams.set('country', env.SEMRUSH_COUNTRY);
    url.searchParams.set('format', 'json');
    const headers: Record<string, string> = {};
    headers.Authorization = ['Apikey', env.SEMRUSH_API_KEY].join(' ');
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Semrush request failed: ${response.status} ${await response.text()}`);
    const body = await response.json() as { data?: Record<string, unknown> };
    const data = body.data ?? {};
    return {
      keyword: normalizedKeyword,
      country: env.SEMRUSH_COUNTRY,
      searchVolume: optionalNumber(data.search_volume),
      keywordDifficulty: optionalNumber(data.keyword_difficulty),
      competitiveDensity: optionalNumber(data.competitive_density),
      cpcUsdCents: optionalNumber(data.cpc),
      intents: stringList(data.intents),
      trends: numberList(data.trends),
      fetchedAt: new Date().toISOString(),
    };
  }
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map(String).map((item) => item.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function numberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map(Number).filter(Number.isFinite);
  return list.length ? list : undefined;
}
