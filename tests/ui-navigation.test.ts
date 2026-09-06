import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync('src/web/index.html', 'utf8');
const app = readFileSync('src/web/app.js', 'utf8');
const products = readFileSync('src/web/products.js', 'utf8');
const notifications = readFileSync('src/web/notification-center.js', 'utf8');
const hardening = readFileSync('src/web/ui-hardening.js', 'utf8');
const copyStatic = readFileSync('scripts/copy-static.mjs', 'utf8');

test('all main sidebar navigation icons have a live controller', () => {
  for (const view of ['dashboard', 'reports', 'opportunities', 'content', 'logs', 'integrations']) {
    assert.match(index, new RegExp(`data-view="${view}"`), `${view} sidebar navigation is missing`);
  }

  assert.match(index, /id="productsNavBtn"/, 'products navigation icon is missing');
  assert.match(products, /target\.id === 'productsNavBtn'/, 'products navigation icon has no click controller');
  assert.match(index, /id="notificationLaunchBtn"/, 'notifications navigation icon is missing');
  assert.match(notifications, /notificationLaunchBtn/, 'notifications navigation icon has no notification-center controller');
});

test('product entry points are wired and product controller is bundled into generated app pages', () => {
  for (const id of ['productsNavBtn', 'productsQuickBtn', 'productsFlowBtn', 'productsReviewFlowBtn']) {
    assert.match(index, new RegExp(`id="${id}"`), `${id} is missing from the UI`);
    assert.match(products, new RegExp(id), `${id} is not handled by products.js`);
  }

  assert.match(copyStatic, /const products = await readFile\('src\/web\/products\.js'/);
  assert.match(copyStatic, /inlineProductController/);
  assert.match(copyStatic, /<script>\\n\$\{products\}\\n<\/script>/);
});

test('main pages and notification center expose back and forward navigation', () => {
  assert.match(index, /id="navBackBtn"[^>]*aria-label="الرجوع"/);
  assert.match(index, /id="navForwardBtn"[^>]*aria-label="التقدم"/);
  assert.match(app, /navBackBtn/);
  assert.match(app, /navForwardBtn/);
  assert.match(app, /history\.back\(\)/);
  assert.match(app, /history\.forward\(\)/);

  assert.match(hardening, /data-gw-notify-nav="back"/);
  assert.match(hardening, /data-gw-notify-nav="forward"/);
  assert.match(hardening, /history\.back\(\)/);
  assert.match(hardening, /history\.forward\(\)/);
});

test('generated production pages include UI hardening after notification center code', () => {
  assert.match(copyStatic, /const uiHardening = await readFile\('src\/web\/ui-hardening\.js'/);
  assert.match(copyStatic, /\$\{notificationUiSync\}/);
  assert.match(copyStatic, /\$\{uiHardening\}/);
});
