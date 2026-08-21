import type { DatabaseBackend, GoogleDriveOAuthTokenState, GoogleDriveWatchState } from './database';
import { Store } from './store';

/**
 * Keeps Google Drive OAuth state in a dedicated database while lazily copying
 * the last known token/folder/watch state from the main application store.
 * This makes Drive survive future DATABASE_URL rotations.
 */
export class PersistentGoogleDriveStore extends Store {
  constructor(db: DatabaseBackend, private readonly legacyStore: Store) {
    super(db);
  }

  override async getGoogleDriveOAuthToken(): Promise<GoogleDriveOAuthTokenState | undefined> {
    const current = await super.getGoogleDriveOAuthToken();
    if (current) return current;
    const legacy = await this.legacyStore.getGoogleDriveOAuthToken();
    if (legacy) await super.setGoogleDriveOAuthToken(legacy);
    return legacy;
  }

  override async getGoogleDriveFolderId(): Promise<string | undefined> {
    const current = await super.getGoogleDriveFolderId();
    if (current) return current;
    const legacy = await this.legacyStore.getGoogleDriveFolderId();
    if (legacy) await super.setGoogleDriveFolderId(legacy);
    return legacy;
  }

  override async getGoogleDriveWatch(): Promise<GoogleDriveWatchState | undefined> {
    const current = await super.getGoogleDriveWatch();
    if (current) return current;
    const legacy = await this.legacyStore.getGoogleDriveWatch();
    if (legacy) await super.setGoogleDriveWatch(legacy);
    return legacy;
  }
}
