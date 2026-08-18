import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel Node root entrypoint default-exports the HTTP server', async () => {
  const source = await readFile('src/app.mjs', 'utf8');
  assert.match(source, /createApp/);
  assert.match(source, /export default app/);
  assert.match(source, /dist\/src\/app\.js/);
});
