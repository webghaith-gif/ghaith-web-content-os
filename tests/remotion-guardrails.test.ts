import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Remotion is the video renderer and the static-frame MP4 fallback is disabled', async () => {
  const assetService = await readFile('src/services/asset.service.ts', 'utf8');
  const fallbackRenderer = await readFile('src/services/fallback-media-renderer.ts', 'utf8');
  const remotionAdapter = await readFile('src/integrations/remotion.adapter.ts', 'utf8');

  assert.match(assetService, /video-remotion\.mp4/);
  assert.match(assetService, /provider: 'remotion'/);
  assert.doesNotMatch(assetService, /video-fallback\.mp4/);
  assert.doesNotMatch(fallbackRenderer, /makeVideo/);
  assert.match(remotionAdapter, /renderMediaOnVercel/);
});

test('HeyGen uses the automation bridge and does not call legacy v1 or v2 endpoints', async () => {
  const heygen = await readFile('src/integrations/heygen.adapter.ts', 'utf8');
  assert.match(heygen, /HEYGEN_AUTOMATION_WEBHOOK_URL/);
  assert.doesNotMatch(heygen, /\/v[12]\//);
});
