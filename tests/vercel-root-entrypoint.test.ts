import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel discovers server.ts instead of an app-named module', async () => {
  const server = await readFile('src/server.ts', 'utf8');
  assert.match(server, /from '\.\/application'/);
  assert.match(server, /createApp\(\)\.listen\(env\.PORT/);

  await assert.rejects(readFile('src/app.ts', 'utf8'));
  await assert.rejects(readFile('src/app.js', 'utf8'));
  await assert.rejects(readFile('src/app.mjs', 'utf8'));
});
