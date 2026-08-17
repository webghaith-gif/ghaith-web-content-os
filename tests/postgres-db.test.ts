import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresDb } from '../src/repositories/postgres-db';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgresDb persists state and rolls back failed mutations', { skip: !databaseUrl }, async () => {
  const db = new PostgresDb(databaseUrl!, false);
  try {
    await db.mutate((state) => {
      state.reports = [];
      state.opportunities = [];
      state.contents = [];
      state.logs = [];
    });

    await db.mutate((state) => {
      state.reports.push({
        id: 'pg-persistence-check',
        title: 'Persistence check',
        body: 'Stored in PostgreSQL',
        createdAt: new Date().toISOString(),
      });
    });

    const persisted = await db.read();
    assert.equal(persisted.reports.length, 1);
    assert.equal(persisted.reports[0]?.id, 'pg-persistence-check');

    await assert.rejects(async () => {
      await db.mutate((state) => {
        state.reports.push({
          id: 'must-rollback',
          title: 'Rollback',
          body: 'This mutation must not commit',
          createdAt: new Date().toISOString(),
        });
        throw new Error('force rollback');
      });
    });

    const afterRollback = await db.read();
    assert.equal(afterRollback.reports.some((report) => report.id === 'must-rollback'), false);
  } finally {
    await db.close();
  }
});
