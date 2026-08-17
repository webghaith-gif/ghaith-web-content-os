import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/repositories/store';
import { JsonDb } from '../src/repositories/json-db';

test('Publishing logs find a previous SUCCESS by idempotency key', async () => {
  const store = new Store(new JsonDb(path.join(os.tmpdir(), `ghaith-${crypto.randomUUID()}.json`)));
  await store.addLog({ contentId:'c', platform:'facebook', result:'SUCCESS', attempt:1, processed:true, idempotencyKey:'same' });
  assert.equal((await store.findSuccessfulLog('same'))?.result, 'SUCCESS');
});
