import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env';
import type { Store } from '../repositories/store';

interface CanvaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

export class CanvaOAuthManager {
  constructor(private readonly store: Store) {}

  get configured(): boolean {
    return Boolean(env.CANVA_CLIENT_ID && env.CANVA_CLIENT_SECRET);
  }

  async status() {
    const stored = await this.store.getCanvaOAuthToken();
    return {
      configured: this.configured,
      connected: Boolean(env.CANVA_ACCESS_TOKEN || stored?.accessToken),
      authMode: env.CANVA_ACCESS_TOKEN ? 'access_token' : stored?.accessToken ? 'oauth' : this.configured ? 'oauth_pending' : 'none',
      expiresAt: stored?.expiresAt ?? null,
    };
  }

  async createAuthorizationUrl(redirectUri: string): Promise<string> {
    this.requireClientCredentials();
    const codeVerifier = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    const state = randomUUID().replace(/-/g, '');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    await this.store.setCanvaOAuthPending({
      state,
      codeVerifier,
      redirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const url = new URL('https://www.canva.com/api/oauth/authorize');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 's256');
    url.searchParams.set('scope', env.CANVA_SCOPES);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.CANVA_CLIENT_ID!);
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', redirectUri);
    return url.toString();
  }

  async handleCallback(code: string, state: string): Promise<void> {
    this.requireClientCredentials();
    const pending = await this.store.getCanvaOAuthPending();
    if (!pending || pending.state !== state || pending.expiresAt < Date.now()) {
      await this.store.setCanvaOAuthPending(undefined);
      throw new Error('Invalid or expired Canva OAuth state.');
    }

    const token = await this.exchange(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.codeVerifier,
      redirect_uri: pending.redirectUri,
    }));
    await this.saveToken(token);
    await this.store.setCanvaOAuthPending(undefined);
  }

  async getAccessToken(): Promise<string | undefined> {
    if (env.CANVA_ACCESS_TOKEN) return env.CANVA_ACCESS_TOKEN;
    const stored = await this.store.getCanvaOAuthToken();
    if (!stored) return undefined;
    if (stored.expiresAt > Date.now() + 120_000) return stored.accessToken;
    if (!stored.refreshToken || !this.configured) return undefined;

    const token = await this.exchange(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    }));
    await this.saveToken(token);
    return token.access_token;
  }

  private async saveToken(token: CanvaTokenResponse): Promise<void> {
    if (!token.access_token || !token.refresh_token) throw new Error('Canva token response is incomplete.');
    await this.store.setCanvaOAuthToken({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 14_400) * 1000,
      scope: token.scope,
    });
  }

  private async exchange(body: URLSearchParams): Promise<CanvaTokenResponse> {
    this.requireClientCredentials();
    const credentials = Buffer.from(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) throw new Error(`Canva OAuth token exchange failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<CanvaTokenResponse>;
  }

  private requireClientCredentials() {
    if (!env.CANVA_CLIENT_ID || !env.CANVA_CLIENT_SECRET) {
      throw new Error('CANVA_CLIENT_ID and CANVA_CLIENT_SECRET are required for Canva OAuth.');
    }
  }
}
