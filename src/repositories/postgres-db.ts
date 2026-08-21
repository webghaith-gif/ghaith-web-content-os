import { Pool } from 'pg';
import type { DatabaseBackend, DatabaseShape } from './database';
import { emptyDb, normalizeDb } from './database';

interface QueryResultLike<T = any> { rows: T[]; }
interface Queryable {
  query<T = any>(text: string, values?: unknown[]): Promise<QueryResultLike<T>>;
}
interface PoolClientLike extends Queryable { release(): void; }
interface PoolLike extends Queryable {
  connect(): Promise<PoolClientLike>;
  end(): Promise<void>;
  on?(event: 'error', listener: (error: Error) => void): void;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ghaith_web_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

const INSERT_INITIAL_SQL = `
INSERT INTO ghaith_web_state (id, state)
VALUES (1, $1::jsonb)
ON CONFLICT (id) DO NOTHING
`;

const READ_CACHE_TTL_MS = 5 * 60 * 1000;

export class PostgresDb implements DatabaseBackend {
  private readonly pool: PoolLike;
  private ready: Promise<void> | undefined;
  private cachedState: DatabaseShape | undefined;
  private cacheExpiresAt = 0;
  private readInFlight: Promise<DatabaseShape> | undefined;

  constructor(connectionString: string, ssl: boolean, rejectUnauthorized = true, pool?: PoolLike) {
    if (!connectionString.trim()) throw new Error('DATABASE_URL is required for PostgreSQL storage.');
    this.pool = pool ?? (new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized } : false,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    }) as unknown as PoolLike);

    this.pool.on?.('error', (error) => {
      console.error('PostgreSQL pool idle-client error:', error instanceof Error ? error.message : String(error));
    });
  }

  private ensureInitialized(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.pool.query(CREATE_TABLE_SQL);
        await this.pool.query(INSERT_INITIAL_SQL, [JSON.stringify(emptyDb())]);
      })().catch((error) => {
        this.ready = undefined;
        throw error;
      });
    }
    return this.ready;
  }

  private updateCache(state: DatabaseShape) {
    this.cachedState = state;
    this.cacheExpiresAt = Date.now() + READ_CACHE_TTL_MS;
  }

  async read(): Promise<DatabaseShape> {
    await this.ensureInitialized();
    if (this.cachedState && Date.now() < this.cacheExpiresAt) return this.cachedState;
    if (this.readInFlight) return this.readInFlight;

    this.readInFlight = (async () => {
      const result = await this.pool.query<{ state: DatabaseShape }>('SELECT state FROM ghaith_web_state WHERE id = 1');
      const state = result.rows[0] ? normalizeDb(result.rows[0].state) : emptyDb();
      this.updateCache(state);
      return state;
    })().finally(() => {
      this.readInFlight = undefined;
    });

    return this.readInFlight;
  }

  async mutate<T>(fn: (db: DatabaseShape) => T | Promise<T>): Promise<T> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ state: DatabaseShape }>('SELECT state FROM ghaith_web_state WHERE id = 1 FOR UPDATE');
      const db = normalizeDb(result.rows[0]?.state ?? emptyDb());
      const output = await fn(db);
      await client.query(
        'UPDATE ghaith_web_state SET state = $1::jsonb, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(db)],
      );
      await client.query('COMMIT');
      this.updateCache(db);
      return output;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* keep original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    this.cachedState = undefined;
    this.cacheExpiresAt = 0;
    await this.pool.end();
  }
}
