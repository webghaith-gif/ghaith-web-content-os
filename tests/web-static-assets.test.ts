import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webDir = path.join(root, 'src', 'web');
const indexHtml = readFileSync(path.join(webDir, 'index.html'), 'utf8');
const sw = readFileSync(path.join(webDir, 'sw.js'), 'utf8');
const application = readFileSync(path.join(root, 'src', 'application.ts'), 'utf8');
const server = readFileSync(path.join(root, 'src', 'server.ts'), 'utf8');

const stripQuery = (value: string) => value.split('?')[0] || value;

function localAssetRefs(source: string) {
  return [...source.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
    .map((match) => stripQuery(match[1]!))
    .filter((value) => !value.startsWith('/api/'));
}

function serviceWorkerRefs(source: string) {
  const staticBlock = source.match(/const STATIC=\[(.*?)\];/s)?.[1] ?? '';
  return [...staticBlock.matchAll(/['"](\/[^'"]+)['"]/g)].map((match) => stripQuery(match[1]!));
}

function servedStaticPaths(source: string) {
  return new Set([...source.matchAll(/^\s*'([^']+)'\s*:\s*\{\s*file:/gm)].map((match) => match[1]!));
}

function isServed(asset: string) {
  if (servedStaticPaths(application).has(asset)) return true;
  return server.includes(`url.pathname === '${asset}'`);
}

test('every local HTML asset exists and is served by the Node app', () => {
  for (const asset of localAssetRefs(indexHtml)) {
    const file = path.join(webDir, asset.slice(1));
    assert.equal(existsSync(file), true, `Missing web asset file for ${asset}`);
    assert.equal(isServed(asset), true, `Static route is missing for ${asset}`);
  }
});

test('every service-worker precache asset exists and is served', () => {
  for (const asset of serviceWorkerRefs(sw)) {
    if (asset === '/') {
      assert.equal(isServed('/'), true, 'Root static route is missing');
      continue;
    }
    const file = path.join(webDir, asset.slice(1));
    assert.equal(existsSync(file), true, `Missing service-worker asset file for ${asset}`);
    assert.equal(isServed(asset), true, `Static route is missing for service-worker asset ${asset}`);
  }
});

test('frontend cache-busting versions stay aligned', () => {
  const htmlVersions = [...indexHtml.matchAll(/\?v=(\d+)/g)].map((match) => match[1]!);
  assert.ok(htmlVersions.length >= 3, 'Expected cache-busting versions on frontend assets');
  assert.equal(new Set(htmlVersions).size, 1, 'Frontend asset versions are not aligned');

  const swVersion = sw.match(/ghaith-web-content-os-v(\d+)/)?.[1];
  assert.ok(swVersion, 'Service-worker cache version is missing');
  assert.equal(swVersion, htmlVersions[0], 'Service-worker cache version does not match HTML asset version');
});

test('Search Console status is never inferred from Google Drive status', () => {
  assert.ok(server.includes("url.pathname === '/api/integrations/search-console/test'"), 'Search Console must use its own connection probe');
  const searchConsoleSection = server.match(/if \(method === 'GET' && url\.pathname === '\/api\/integrations\/search-console\/test'\)[\s\S]*?\n\s*}\n/)?.[0] ?? '';
  assert.equal(searchConsoleSection.includes('/api/integrations/google-drive/status'), false, 'Search Console must not reuse Google Drive connection state');
});
