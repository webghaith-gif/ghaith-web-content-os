import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStartupDiagnostic } from '../src/utils/startup-diagnostic';

test('startup diagnostic exposes configuration state without secrets', () => {
  const oldDriver = process.env.STORAGE_DRIVER;
  const oldUrl = process.env.DATABASE_URL;
  process.env.STORAGE_DRIVER = 'postgres';
  process.env.DATABASE_URL = 'postgresql://user:secret@example.com/db';
  try {
    const result = safeStartupDiagnostic(new Error('DATABASE_URL is required when STORAGE_DRIVER=postgres.'));
    assert.equal(result.storageDriver, 'postgres');
    assert.equal(result.databaseUrlConfigured, true);
    assert.equal(result.error, 'STARTUP_ERROR');
  } finally {
    if (oldDriver === undefined) delete process.env.STORAGE_DRIVER; else process.env.STORAGE_DRIVER = oldDriver;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
  }
});
