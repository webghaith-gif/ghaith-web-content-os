import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb, type DatabaseBackend, type DatabaseShape } from '../src/repositories/database';
import { PersistentCanvaStore } from '../src/repositories/persistent-canva-store';
import { Store } from '../src/repositories/store';

class MemoryDb implements DatabaseBackend {
  state: DatabaseShape = emptyDb();
  async read(): Promise<DatabaseShape> { return structuredClone(this.state); }
  async readFresh(): Promise<DatabaseShape> { return structuredClone(this.state); }
  async mutate<T>(fn: (db: DatabaseShape) => T | Promise<T>): Promise<T> { return fn(this.state); }
}

test('Canva OAuth token migrates once into the integration vault', async () => {
  const legacyDb = new MemoryDb();
  const vaultDb = new MemoryDb();
  const legacy = new Store(legacyDb);
  const vault = new PersistentCanvaStore(vaultDb, legacy);

  const token = {
    accessToken: 'access-test',
    refreshToken: 'refresh-test',
    expiresAt: Date.now() + 60_000,
    scope: 'design:content:read',
  };
  await legacy.setCanvaOAuthToken(token);

  assert.deepEqual(await vault.getCanvaOAuthToken(), token);
  await legacy.setCanvaOAuthToken(undefined);
  assert.deepEqual(await vault.getCanvaOAuthToken(), token);
});

test('Canva OAuth pending state is stored in the vault, not the runtime store', async () => {
  const legacyDb = new MemoryDb();
  const vaultDb = new MemoryDb();
  const legacy = new Store(legacyDb);
  const vault = new PersistentCanvaStore(vaultDb, legacy);

  const pending = {
    state: 'state-test',
    codeVerifier: 'verifier-test',
    redirectUri: 'https://example.test/callback',
    expiresAt: Date.now() + 60_000,
  };
  await vault.setCanvaOAuthPending(pending);

  assert.equal(await legacy.getCanvaOAuthPending(), undefined);
  assert.deepEqual(await vault.getCanvaOAuthPending(), pending);
});
