import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel uses an explicit api function and static public assets', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
    buildCommand?: string;
    functions?: Record<string, unknown>;
    rewrites?: Array<{ source?: string; destination?: string }>;
  };

  assert.equal(config.buildCommand, 'npm run build');
  assert.ok(config.functions?.['api/index.cjs']);
  assert.ok(config.rewrites?.some((rule) => rule.source === '/api/:path*' && rule.destination?.startsWith('/api/index')));

  const apiEntrypoint = await readFile('api/index.cjs', 'utf8');
  assert.match(apiEntrypoint, /dist\/src\/app\.js/);
  assert.match(apiEntrypoint, /VERCEL_API_BOOTSTRAP_ERROR/);

  const copyStatic = await readFile('scripts/copy-static.mjs', 'utf8');
  assert.match(copyStatic, /public/);
});
