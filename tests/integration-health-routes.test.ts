import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src', 'application.ts'), 'utf8');

test('integration health routes exist for direct services', () => {
  for (const route of [
    '/api/integrations/openai/test',
    '/api/integrations/google-drive/test',
    '/api/integrations/semrush/test',
    '/api/integrations/canva/test',
    '/api/integrations/heygen/test',
  ]) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/')));
  }
});

test('integration overview exposes state without secret values', () => {
  assert.match(source, /\/api\/integrations/);
  assert.doesNotMatch(source, /OPENAI_API_KEY:\s*env\.OPENAI_API_KEY/);
  assert.doesNotMatch(source, /SEMRUSH_API_KEY:\s*env\.SEMRUSH_API_KEY/);
  assert.doesNotMatch(source, /HEYGEN_API_KEY:\s*env\.HEYGEN_API_KEY/);
  assert.doesNotMatch(source, /CANVA_ACCESS_TOKEN:\s*env\.CANVA_ACCESS_TOKEN/);
  assert.doesNotMatch(source, /GOOGLE_DRIVE_CLIENT_SECRET:\s*env\.GOOGLE_DRIVE_CLIENT_SECRET/);
});
