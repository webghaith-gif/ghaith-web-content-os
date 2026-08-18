import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStartupDiagnostic } from '../src/utils/startup-diagnostic';

test('startup diagnostic does not expose connection strings', () => {
  const diagnostic = safeStartupDiagnostic(new Error('Failed for postgresql://user:secret@example.com/db'));
  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.error, 'STARTUP_ERROR');
  assert.equal(String(diagnostic.message).includes('secret'), false);
  assert.equal(String(diagnostic.message).includes('postgresql://'), false);
});
