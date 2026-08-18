import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresDb } from '../src/repositories/postgres-db';

test('PostgresDb registers an idle pool error handler when supported', async () => {
  let registered = false;
  const pool = {
    on(event: string, _listener: (error: Error) => void) { if (event === 'error') registered = true; },
    async query() { return { rows: [{ state: { reports: [], opportunities: [], contents: [], logs: [] } }] }; },
    async connect() { throw new Error('not used'); },
    async end() {},
  } as any;

  const db = new PostgresDb('postgresql://example.invalid/db', false, true, pool);
  assert.equal(registered, true);
  await db.close();
});
