import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env';
import { GoogleDriveOAuthManager } from '../src/integrations/google-drive-oauth';
import { Store } from '../src/repositories/store';
import { emptyDb, type DatabaseBackend, type DatabaseShape } from '../src/repositories/database';

class MemoryDb implements DatabaseBackend {
  private state: DatabaseShape = emptyDb();
  async read(): Promise<DatabaseShape> { return structuredClone(this.state); }
  async mutate<T>(fn: (db: DatabaseShape) => T | Promise<T>): Promise<T> {
    return fn(this.state);
  }
}

test('Google Drive OAuth requests offline least-privilege access and stores state', async () => {
  const snapshot = {
    clientId: env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    scopes: env.GOOGLE_DRIVE_SCOPES,
    accessToken: env.GOOGLE_DRIVE_ACCESS_TOKEN,
    refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
    folderId: env.GOOGLE_DRIVE_FOLDER_ID,
  };

  try {
    env.GOOGLE_DRIVE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-client-secret';
    env.GOOGLE_DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
    env.GOOGLE_DRIVE_ACCESS_TOKEN = undefined;
    env.GOOGLE_DRIVE_REFRESH_TOKEN = undefined;
    env.GOOGLE_DRIVE_FOLDER_ID = undefined;

    const store = new Store(new MemoryDb());
    const oauth = new GoogleDriveOAuthManager(store);
    const authorizationUrl = new URL(await oauth.createAuthorizationUrl('https://example.test/callback'));

    assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
    assert.equal(authorizationUrl.pathname, '/o/oauth2/v2/auth');
    assert.equal(authorizationUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
    assert.equal(authorizationUrl.searchParams.get('access_type'), 'offline');
    assert.equal(authorizationUrl.searchParams.get('include_granted_scopes'), 'true');
    assert.equal(authorizationUrl.searchParams.get('prompt'), 'consent');
    assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://example.test/callback');

    const pending = await store.getGoogleDriveOAuthPending();
    assert.ok(pending?.state);
    assert.equal(authorizationUrl.searchParams.get('state'), pending?.state);

    const status = await oauth.status();
    assert.equal(status.configured, true);
    assert.equal(status.connected, false);
    assert.equal(status.authMode, 'oauth_pending');
  } finally {
    env.GOOGLE_DRIVE_CLIENT_ID = snapshot.clientId;
    env.GOOGLE_DRIVE_CLIENT_SECRET = snapshot.clientSecret;
    env.GOOGLE_DRIVE_SCOPES = snapshot.scopes;
    env.GOOGLE_DRIVE_ACCESS_TOKEN = snapshot.accessToken;
    env.GOOGLE_DRIVE_REFRESH_TOKEN = snapshot.refreshToken;
    env.GOOGLE_DRIVE_FOLDER_ID = snapshot.folderId;
  }
});
