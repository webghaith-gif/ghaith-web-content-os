import type { CanvaOAuthPendingState, CanvaOAuthTokenState, DatabaseBackend } from './database';
import { Store } from './store';

/**
 * Keeps Canva OAuth state in the same dedicated integration vault used by
 * Google Drive while lazily copying any last known token/pending state from
 * the main application store. This makes Canva survive future DATABASE_URL
 * rotations once it is authorized again.
 */
export class PersistentCanvaStore extends Store {
  constructor(db: DatabaseBackend, private readonly legacyStore: Store) {
    super(db);
  }

  override async getCanvaOAuthToken(): Promise<CanvaOAuthTokenState | undefined> {
    const current = await super.getCanvaOAuthToken();
    if (current) return current;
    const legacy = await this.legacyStore.getCanvaOAuthToken();
    if (legacy) await super.setCanvaOAuthToken(legacy);
    return legacy;
  }

  override async getCanvaOAuthPending(): Promise<CanvaOAuthPendingState | undefined> {
    const current = await super.getCanvaOAuthPending();
    if (current) return current;
    const legacy = await this.legacyStore.getCanvaOAuthPending();
    if (legacy) await super.setCanvaOAuthPending(legacy);
    return legacy;
  }
}
