import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

test('Vercel discovers server.ts instead of an app-named module', async () => {
  const server = await readFile('src/server.ts', 'utf8');
  assert.match(server, /from '\.\/application'/);
  assert.match(server, /createApp\(\)\.listen\(env\.PORT/);

  await assert.rejects(access('src/app.ts'));
  await assert.rejects(access('src/app.js'));
  await assert.rejects(access('src/app.mjs'));
});
