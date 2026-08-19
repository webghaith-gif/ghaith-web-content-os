import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env';
import { OpenAIAdapter } from '../src/integrations/openai.adapter';

type RoutingOverrides = Partial<Pick<typeof env,
  'GEMINI_API_KEY' | 'ALLOW_PAID_AI' | 'OPENAI_API_KEY' | 'AI_GATEWAY_API_KEY' | 'VERCEL_OIDC_TOKEN'
>>;

function modeWith(overrides: RoutingOverrides, oidcToken?: string): string {
  const snapshot = {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    ALLOW_PAID_AI: env.ALLOW_PAID_AI,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
    VERCEL_OIDC_TOKEN: env.VERCEL_OIDC_TOKEN,
  };

  try {
    env.GEMINI_API_KEY = undefined;
    env.ALLOW_PAID_AI = false;
    env.OPENAI_API_KEY = undefined;
    env.AI_GATEWAY_API_KEY = undefined;
    env.VERCEL_OIDC_TOKEN = undefined;
    Object.assign(env, overrides);
    return new OpenAIAdapter().modeFor(oidcToken);
  } finally {
    Object.assign(env, snapshot);
  }
}

test('free-first AI routing keeps paid providers locked unless explicitly enabled', () => {
  assert.equal(
    modeWith({ GEMINI_API_KEY: 'test-gemini-key' }, 'runtime-oidc'),
    'gemini_api',
    'Gemini must win even when a Vercel request OIDC token exists',
  );

  assert.equal(
    modeWith({
      ALLOW_PAID_AI: false,
      OPENAI_API_KEY: 'test-openai-key',
      VERCEL_OIDC_TOKEN: 'test-vercel-oidc',
    }, 'request-oidc'),
    'none',
    'paid credentials must not bypass ALLOW_PAID_AI=false',
  );

  assert.equal(
    modeWith({ ALLOW_PAID_AI: true, OPENAI_API_KEY: 'test-openai-key' }),
    'openai_api',
    'direct OpenAI requires explicit paid opt-in',
  );

  assert.equal(
    modeWith({ ALLOW_PAID_AI: true }, 'request-oidc'),
    'vercel_ai_gateway',
    'Vercel AI Gateway requires explicit paid opt-in',
  );
});
