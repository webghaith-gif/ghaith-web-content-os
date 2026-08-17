import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformRegistry } from '../src/platforms/registry';

test('PlatformRegistry supports configurable platforms including X', () => {
  const registry = new PlatformRegistry();
  assert.ok(registry.list().includes('x'));
  assert.equal(registry.get('x').platform, 'x');
});
