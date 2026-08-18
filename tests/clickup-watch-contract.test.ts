import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContentItem } from '../src/core/types';
import { buildClickUpWatchPlans } from '../src/services/clickup-watch-contract';

function content(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'content-1',
    title: 'اختبار غيث ويب',
    topic: 'اختبار',
    targetAudience: 'Ghaith Web audience',
    objective: 'test',
    platforms: ['facebook', 'instagram', 'tiktok', 'pinterest', 'youtube'],
    contentType: 'multi-platform-package',
    package: {
      hook: 'Hook',
      caption: 'Caption',
      description: 'Description',
      script: 'Script',
      cta: 'CTA',
    },
    assets: [
      { kind: 'image', url: 'https://cdn.example.com/post.png', provider: 'external' },
      { kind: 'video', url: 'https://cdn.example.com/video.mp4', provider: 'external' },
    ],
    googleDriveUrls: [],
    status: 'READY',
    revision: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test('fixed ClickUp Make contract creates one safe plan per supported platform', () => {
  const plans = buildClickUpWatchPlans(content());
  assert.equal(plans.length, 5);

  const byPlatform = Object.fromEntries(plans.map((plan) => [plan.platform, plan]));
  assert.match(byPlatform.facebook!.finalName, /^\[FB\]/);
  assert.match(byPlatform.instagram!.finalName, /^\[IG\]/);
  assert.match(byPlatform.tiktok!.finalName, /^\[TT\]/);
  assert.match(byPlatform.pinterest!.finalName, /^\[PIN\]/);
  assert.match(byPlatform.youtube!.finalName, /^\[YT\]/);

  for (const plan of plans) {
    assert.match(plan.holdName, /^\[GW-HOLD\]/);
    assert.doesNotMatch(plan.holdName, /\[(FB|IG|TT|PIN|YT)\]/);
  }

  assert.equal(byPlatform.facebook!.asset.kind, 'image');
  assert.equal(byPlatform.instagram!.asset.kind, 'image');
  assert.equal(byPlatform.pinterest!.asset.kind, 'image');
  assert.equal(byPlatform.tiktok!.asset.kind, 'video');
  assert.equal(byPlatform.youtube!.asset.kind, 'video');
  assert.equal(byPlatform.pinterest!.fileName, 'post.png');
  assert.equal(byPlatform.youtube!.fileName, 'video.mp4');
});

test('clickup_watch rejects platforms that have no fixed Make route', () => {
  assert.throws(
    () => buildClickUpWatchPlans(content({ platforms: ['x'] })),
    /not supported by the fixed ClickUp → Make scenario/,
  );
});

test('preflight blocks READY handoff when required platform media is missing', () => {
  assert.throws(
    () => buildClickUpWatchPlans(content({ platforms: ['youtube'], assets: [{ kind: 'image', url: 'https://cdn.example.com/post.png' }] })),
    /youtube requires one video attachment before READY/,
  );
});
