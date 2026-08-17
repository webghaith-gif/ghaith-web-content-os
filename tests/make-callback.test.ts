import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/repositories/store';
import { JsonDb } from '../src/repositories/json-db';
import { ApprovalService } from '../src/services/approval.service';
import { PublishingOrchestrator } from '../src/services/publishing-orchestrator';

function tempStore() { return new Store(new JsonDb(path.join(os.tmpdir(), `ghaith-callback-${crypto.randomUUID()}.json`))); }

test('Make callbacks mark content PUBLISHED only after every target platform completes', async () => {
  const store = tempStore();
  const content = await store.createContent({ title:'A', topic:'A', platforms:['facebook','instagram'], package:{}, assets:[], googleDriveUrls:[], status:'READY' });
  const clickup = { enabled:false, updateStatus: async () => undefined } as any;
  const orchestrator = new PublishingOrchestrator(store, new ApprovalService(store), undefined, clickup);
  await orchestrator.recordMakeResult({ contentId:content.id, platform:'facebook', result:'SUCCESS' });
  assert.equal((await store.getContent(content.id)).status, 'READY');
  await orchestrator.recordMakeResult({ contentId:content.id, platform:'instagram', result:'WARNING', errorMessage:'published without URL' });
  assert.equal((await store.getContent(content.id)).status, 'PUBLISHED');
});
