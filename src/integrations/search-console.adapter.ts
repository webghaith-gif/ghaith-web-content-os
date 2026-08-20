import type { Store } from '../repositories/store';
import { GoogleDriveOAuthManager } from './google-drive-oauth';

const TARGET_SITE = 'https://ghaith-web-content-os.vercel.app/';

export interface SearchConsoleProbe {
  ok: boolean;
  enabled: boolean;
  connected: boolean;
  siteUrl: string;
  permissionLevel?: string;
  sitesCount?: number;
  message?: string;
}

export interface SearchConsolePerformance {
  ok: boolean;
  siteUrl: string;
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  rows: number;
  message?: string;
}

export class SearchConsoleAdapter {
  private readonly oauth: GoogleDriveOAuthManager;

  constructor(store: Store) {
    this.oauth = new GoogleDriveOAuthManager(store);
  }

  async testConnection(): Promise<SearchConsoleProbe> {
    const token = await this.oauth.getAccessToken();
    if (!token) {
      return {
        ok: false,
        enabled: false,
        connected: false,
        siteUrl: TARGET_SITE,
        message: 'Google OAuth is not authorized.',
      };
    }

    const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        enabled: true,
        connected: false,
        siteUrl: TARGET_SITE,
        message: `Search Console API returned ${response.status}: ${body}`,
      };
    }

    const data = await response.json() as {
      siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
    };
    const sites = data.siteEntry ?? [];
    const match = sites.find((site) => site.siteUrl === TARGET_SITE);

    return {
      ok: Boolean(match),
      enabled: true,
      connected: Boolean(match),
      siteUrl: TARGET_SITE,
      permissionLevel: match?.permissionLevel,
      sitesCount: sites.length,
      ...(!match ? { message: 'OAuth works, but the verified Ghaith Web property was not returned by Search Console.' } : {}),
    };
  }

  async getPerformance(days = 28): Promise<SearchConsolePerformance> {
    const token = await this.oauth.getAccessToken();
    if (!token) throw new Error('Google OAuth is not authorized.');

    const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (safeDays - 1));
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(TARGET_SITE)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate, endDate, rowLimit: 1 }),
      },
    );

    if (!response.ok) {
      throw new Error(`Search Console performance query returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      rows?: Array<{ clicks?: number; impressions?: number; ctr?: number; position?: number }>;
    };
    const row = data.rows?.[0];

    return {
      ok: true,
      siteUrl: TARGET_SITE,
      startDate,
      endDate,
      clicks: Number(row?.clicks ?? 0),
      impressions: Number(row?.impressions ?? 0),
      ctr: Number(row?.ctr ?? 0),
      position: Number(row?.position ?? 0),
      rows: data.rows?.length ?? 0,
      ...(!row ? { message: 'Search Console is connected; Google has not reported search performance data for this new property yet.' } : {}),
    };
  }
}
