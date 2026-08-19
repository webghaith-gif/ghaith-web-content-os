import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const controlled = [
  'GEMINI_API_KEY',
  'ALLOW_PAID_AI',
  'OPENAI_API_KEY',
  'AI_GATEWAY_API_KEY',
  'VERCEL_OIDC_TOKEN',
] as const;

function adapterMode(overrides: Record<string, string> = {}, oidcToken?: string): string {
  const childEnv = { ...process.env } as Record<string, string>;
  for (const key of controlled) delete childEnv[key];
  Object.assign(childEnv, overrides);

  const script = [
    "const { OpenAIAdapter } = require('./dist/src/integrations/openai.adapter.js');",
    `process.stdout.write(new OpenAIAdapter().modeFor(${JSON.stringify(oidcToken)}) + '\\n');`,
  ].join(' ');

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test('Gemini is preferred when its key is configured', () => {
  assert.equal(adapterMode({ GEMINI_API_KEY: 'test-gemini-key' }, 'runtime-oidc'), 'gemini_api');
});

test('paid AI stays disabled even when OpenAI and Vercel credentials exist', () => {
  assert.equal(adapterMode({
    ALLOW_PAID_AI: 'false',
    OPENAI_API_KEY: 'test-openai-key',
    VERCEL_OIDC_TOKEN: 'test-vercel-oidc',
  }, 'request-oidc'), 'none');
});

test('OpenAI direct mode requires explicit paid opt-in', () => {
  assert.equal(adapterMode({
    ALLOW_PAID_AI: 'true',
    OPENAI_API_KEY: 'test-openai-key',
  }), 'openai_api');
});

test('Vercel AI Gateway requires explicit paid opt-in when Gemini/OpenAI are absent', () => {
  assert.equal(adapterMode({ ALLOW_PAID_AI: 'true' }, 'request-oidc'), 'vercel_ai_gateway');
});
