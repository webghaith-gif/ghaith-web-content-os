import { env } from '../config/env';

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}

export type OpenAIAuthMode = 'openai_api' | 'vercel_ai_gateway' | 'none';
export interface OpenAIConnectionProbe {
  ok: boolean;
  enabled: boolean;
  model: string;
  mode: OpenAIAuthMode;
  message?: string;
}

export class OpenAIAdapter {
  modeFor(oidcToken?: string): OpenAIAuthMode {
    if (env.OPENAI_API_KEY) return 'openai_api';
    if (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || oidcToken) return 'vercel_ai_gateway';
    return 'none';
  }

  enabledFor(oidcToken?: string) { return this.modeFor(oidcToken) !== 'none'; }
  get enabled() { return this.enabledFor(); }
  get mode() { return this.modeFor(); }
  modelFor(oidcToken?: string) {
    return this.modeFor(oidcToken) === 'vercel_ai_gateway' ? env.AI_GATEWAY_MODEL : env.OPENAI_MODEL;
  }
  get model() { return this.modelFor(); }

  async testConnection(oidcToken?: string): Promise<OpenAIConnectionProbe> {
    const mode = this.modeFor(oidcToken);
    const model = this.modelFor(oidcToken);
    const base = { enabled: mode !== 'none', model, mode } as const;
    if (mode === 'none') {
      return { ok: false, ...base, message: 'No OpenAI API key or Vercel AI Gateway OIDC token is available.' };
    }

    try {
      if (mode === 'openai_api') {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        });
        if (!response.ok) return { ok: false, ...base, message: `OpenAI returned ${response.status}.` };
        return { ok: true, ...base };
      }

      const response = await this.requestResponses({
        model,
        input: 'Reply with OK.',
        max_output_tokens: 8,
        store: false,
      }, oidcToken);
      if (!response.ok) return { ok: false, ...base, message: `Vercel AI Gateway returned ${response.status}.` };
      return { ok: true, ...base };
    } catch (error) {
      return { ok: false, ...base, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async generateText(instructions: string, input: string, oidcToken?: string): Promise<string> {
    const mode = this.modeFor(oidcToken);
    if (mode === 'none') throw new Error('GPT is not configured: no OpenAI key or Vercel AI Gateway OIDC token is available.');
    const response = await this.requestResponses({
      model: this.modelFor(oidcToken),
      instructions,
      input,
      store: false,
    }, oidcToken);
    if (!response.ok) throw new Error(`GPT request failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as OpenAIResponse;
    if (data.output_text) return data.output_text;
    for (const item of data.output ?? []) {
      for (const part of item.content ?? []) if (typeof part.text === 'string') return part.text;
    }
    return '';
  }

  private requestResponses(body: Record<string, unknown>, oidcToken?: string) {
    const mode = this.modeFor(oidcToken);
    const gateway = mode === 'vercel_ai_gateway';
    const token = gateway
      ? env.AI_GATEWAY_API_KEY ?? env.VERCEL_OIDC_TOKEN ?? oidcToken
      : env.OPENAI_API_KEY;
    if (!token) throw new Error('GPT authentication token is unavailable.');
    const baseUrl = gateway ? env.AI_GATEWAY_BASE_URL : 'https://api.openai.com/v1';
    return fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'http-referer': env.APP_BASE_URL,
        'x-title': 'Ghaith Web Content OS',
      },
      body: JSON.stringify(body),
    });
  }
}
