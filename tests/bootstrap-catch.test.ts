import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel root entrypoint catches bootstrap import failures', async () => {
  const source = await readFile('server.cjs', 'utf8');
  assert.match(source, /try\s*\{/);
  assert.match(source, /require\('\.\/dist\/src\/server\.js'\)/);
  assert.match(source, /BOOTSTRAP_IMPORT_ERROR/);
  assert.match(source, /createServer/);
});
