import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { ApprovalService } from '../src/services/approval.service';
import { Store } from '../src/repositories/store';
import { JsonDb } from '../src/repositories/json-db';

function tempStore() { return new Store(new JsonDb(path.join(os.tmpdir(), `ghaith-${crypto.randomUUID()}.json`))); }

test('Approval Gate moves IN_REVIEW to READY', async () => {
  const store = tempStore();
  const content = await store.createContent({ title:'A', topic:'A', platforms:['facebook'], package:{}, assets:[], googleDriveUrls:[], status:'IN_REVIEW' });
  const clickup = { updateStatus: async () => undefined } as any;
  const service = new ApprovalService(store, clickup);
  const ready = await service.approve(content.id, 'owner');
  assert.equal(ready.status, 'READY');
  assert.equal(ready.approvedBy, 'owner');
});

test('Approval Gate rejects content before READY', async () => {
  const store = tempStore();
  const content = await store.createContent({ title:'A', topic:'A', platforms:['facebook'], package:{}, assets:[], googleDriveUrls:[], status:'IN_REVIEW' });
  const service = new ApprovalService(store);
  assert.throws(() => service.ensureReady(content), /READY/);
});
