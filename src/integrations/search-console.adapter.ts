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
}
