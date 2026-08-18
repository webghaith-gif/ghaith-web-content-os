import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel Node root entrypoint starts the raw HTTP server via listen', async () => {
  const source = await readFile('src/app.mjs', 'utf8');
  assert.match(source, /createApp\(\)\.listen\(port\)/);
  assert.match(source, /process\.env\.PORT/);
  assert.match(source, /dist\/src\/app\.js/);
  assert.doesNotMatch(source, /export default/);
});
