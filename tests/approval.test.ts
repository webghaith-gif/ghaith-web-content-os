import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { ApprovalService } from '../src/services/approval.service';
import { Store } from '../src/repositories/store';
import { JsonDb } from '../src/repositories/json-db';

function tempStore() { return new Store(new JsonDb(path.join(os.tmpdir(), `ghaith-${crypto.randomUUID()}.json`))); }

test('Approval Gate moves IN_REVIEW to READY without external handoff', async () => {
  const store = tempStore();
  const content = await store.createContent({ title:'A', topic:'A', platforms:['facebook'], package:{}, assets:[], googleDriveUrls:[], status:'IN_REVIEW' });
  const service = new ApprovalService(store);
  const ready = await service.approve(content.id, 'owner');
  assert.equal(ready.status, 'READY');
  assert.equal(ready.approvedBy, 'owner');
  assert.equal(ready.clickupTaskId, undefined);
  assert.equal(ready.clickupTaskIds, undefined);
});

test('Approval Gate rejects an explicit failed quality review', async () => {
  const store = tempStore();
  const content = await store.createContent({
    title:'Low quality',
    topic:'Low quality',
    platforms:['facebook'],
    package:{ qualityReview:{ score:50, sourceFaithful:true, platformAdapted:false, nonRepetitive:false } },
    assets:[],
    googleDriveUrls:[],
    status:'IN_REVIEW',
  });
  const service = new ApprovalService(store);
  await assert.rejects(
    () => service.approve(content.id, 'owner'),
    (error: any) => error?.code === 'QUALITY_REVIEW_FAILED' && /score 50\/70/.test(error.message),
  );
  assert.equal((await store.getContent(content.id)).status, 'IN_REVIEW');
});

test('Approval Gate accepts a passing quality review', async () => {
  const store = tempStore();
  const content = await store.createContent({
    title:'Reviewed',
    topic:'Reviewed',
    platforms:['facebook'],
    package:{ qualityReview:{ score:90, sourceFaithful:true, platformAdapted:true, nonRepetitive:true } },
    assets:[],
    googleDriveUrls:[],
    status:'IN_REVIEW',
  });
  const service = new ApprovalService(store);
  assert.equal((await service.approve(content.id, 'owner')).status, 'READY');
});

test('Approval Gate rejects content before READY', async () => {
  const store = tempStore();
  const content = await store.createContent({ title:'A', topic:'A', platforms:['facebook'], package:{}, assets:[], googleDriveUrls:[], status:'IN_REVIEW' });
  const service = new ApprovalService(store);
  assert.throws(() => service.ensureReady(content), /READY/);
});
