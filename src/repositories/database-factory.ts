import { env } from '../config/env';
import type { DatabaseBackend } from './database';
import { JsonDb } from './json-db';
import { PostgresDb } from './postgres-db';

export function createDatabase(): DatabaseBackend {
  if (env.STORAGE_DRIVER === 'postgres') {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required when STORAGE_DRIVER=postgres.');
    return new PostgresDb(env.DATABASE_URL, env.DATABASE_SSL, env.DATABASE_SSL_REJECT_UNAUTHORIZED);
  }
  return new JsonDb(env.DATA_FILE);
}
