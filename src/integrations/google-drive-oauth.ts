import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { PostgresDb } from '../repositories/postgres-db';
import { PersistentGoogleDriveStore } from '../repositories/persistent-google-drive-store';
import type { Store } from '../repositories/store';

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

type GoogleDriveOAuthAuthMode = 'access_token' | 'oauth_refresh_env' | 'oauth' | 'oauth_pending' | 'none';

interface GoogleDriveOAuthStatus {
  configured: boolean;
  connected: boolean;
  authMode: GoogleDriveOAuthAuthMode;
  expiresAt: number | null;
  folderId: string | null;
}

const SEARCH_CONSOLE_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export class GoogleDriveOAuthManager {
  private readonly store: Store;

  constructor(legacyStore: Store) {
    this.store = env.GOOGLE_DRIVE_STATE_DATABASE_URL
      ? new PersistentGoogleDriveStore(
          new PostgresDb(
            env.GOOGLE_DRIVE_STATE_DATABASE_URL,
            env.DATABASE_SSL,
            env.DATABASE_SSL_REJECT_UNAUTHORIZED,
          ),
          legacyStore,
        )
      : legacyStore;
  }

  get configured(): boolean {
    return Boolean(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET);
  }

  async status(): Promise<GoogleDriveOAuthStatus> {
    const stored = await this.store.getGoogleDriveOAuthToken();
    const authMode: GoogleDriveOAuthAuthMode = env.GOOGLE_DRIVE_ACCESS_TOKEN
      ? 'access_token'
      : env.GOOGLE_DRIVE_REFRESH_TOKEN
        ? 'oauth_refresh_env'
        : stored?.accessToken
          ? 'oauth'
          : this.configured
            ? 'oauth_pending'
            : 'none';
    return {
      configured: this.configured,
      connected: Boolean(env.GOOGLE_DRIVE_ACCESS_TOKEN || env.GOOGLE_DRIVE_REFRESH_TOKEN || stored?.accessToken),
      authMode,
      expiresAt: stored?.expiresAt ?? null,
      folderId: env.GOOGLE_DRIVE_FOLDER_ID ?? await this.store.getGoogleDriveFolderId() ?? null,
    };
  }

  async createAuthorizationUrl(redirectUri: string): Promise<string> {
    this.requireClientCredentials();
    const state = randomUUID().replace(/-/g, '');
    await this.store.setGoogleDriveOAuthPending({
      state,
      redirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const scopes = [...new Set(
      `${env.GOOGLE_DRIVE_SCOPES} ${SEARCH_CONSOLE_READONLY_SCOPE}`
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    )].join(' ');

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_DRIVE_CLIENT_ID!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async handleOAuthCallback(code: string, state: string): Promise<void> {
    return this.handleCallback(code, state);
  }

  async handleCallback(code: string, state: string): Promise<void> {
    this.requireClientCredentials();
    const pending = await this.store.getGoogleDriveOAuthPending();
    if (!pending || pending.state !== state || pending.expiresAt < Date.now()) {
      await this.store.setGoogleDriveOAuthPending(undefined);
      throw new Error('Invalid or expired Google Drive OAuth state.');
    }

    const existing = await this.store.getGoogleDriveOAuthToken();
    const token = await this.exchange(new URLSearchParams({
      client_id: env.GOOGLE_DRIVE_CLIENT_ID!,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
      code,
      redirect_uri: pending.redirectUri,
      grant_type: 'authorization_code',
    }));

    if (!token.access_token) throw new Error('Google OAuth token response did not include access_token.');
    const refreshToken = token.refresh_token ?? existing?.refreshToken;
    if (!refreshToken) throw new Error('Google OAuth token response did not include refresh_token. Reconnect Google Drive and approve access again.');

    await this.store.setGoogleDriveOAuthToken({
      accessToken: token.access_token,
      refreshToken,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
      scope: token.scope,
    });
    await this.store.setGoogleDriveOAuthPending(undefined);
  }

  async getAccessToken(): Promise<string | undefined> {
    if (env.GOOGLE_DRIVE_ACCESS_TOKEN) return env.GOOGLE_DRIVE_ACCESS_TOKEN;
    if (env.GOOGLE_DRIVE_REFRESH_TOKEN) return this.refresh(env.GOOGLE_DRIVE_REFRESH_TOKEN);

    const stored = await this.store.getGoogleDriveOAuthToken();
    if (!stored) return undefined;
    if (stored.expiresAt > Date.now() + 120_000) return stored.accessToken;
    if (!stored.refreshToken || !this.configured) return undefined;

    const token = await this.exchange(new URLSearchParams({
      client_id: env.GOOGLE_DRIVE_CLIENT_ID!,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
      refresh_token: stored.refreshToken,
      grant_type: 'refresh_token',
    }));
    if (!token.access_token) throw new Error('Google OAuth refresh response did not include access_token.');

    await this.store.setGoogleDriveOAuthToken({
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? stored.refreshToken,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
      scope: token.scope ?? stored.scope,
    });
    return token.access_token;
  }

  private async refresh(refreshToken: string): Promise<string> {
    this.requireClientCredentials();
    const token = await this.exchange(new URLSearchParams({
      client_id: env.GOOGLE_DRIVE_CLIENT_ID!,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }));
    if (!token.access_token) throw new Error('Google OAuth refresh response did not include access_token.');
    return token.access_token;
  }

  private async exchange(body: URLSearchParams): Promise<GoogleTokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error(`Google OAuth token exchange failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<GoogleTokenResponse>;
  }

  private requireClientCredentials() {
    if (!env.GOOGLE_DRIVE_CLIENT_ID || !env.GOOGLE_DRIVE_CLIENT_SECRET) {
      throw new Error('GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET are required for Google Drive OAuth.');
    }
  }
}
