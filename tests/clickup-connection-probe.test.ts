import test from 'node:test';
import assert from 'node:assert/strict';
import { ClickUpAdapter } from '../src/integrations/clickup.adapter';

test('ClickUp adapter exposes a safe connection probe', () => {
  assert.equal(typeof ClickUpAdapter.prototype.testConnection, 'function');
});
