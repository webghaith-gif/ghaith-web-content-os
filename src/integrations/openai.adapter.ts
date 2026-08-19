import { env } from '../config/env';

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export type OpenAIAuthMode = 'gemini_api' | 'openai_api' | 'vercel_ai_gateway' | 'none';
export interface OpenAIConnectionProbe {
  ok: boolean;
  enabled: boolean;
  model: string;
  mode: OpenAIAuthMode;
  message?: string;
}

// Legacy class name retained to avoid a broad refactor. It now routes AI requests
// free-first: Gemini Free Tier -> explicitly enabled paid provider -> local fallback.
export class OpenAIAdapter {
  modeFor(oidcToken?: string): OpenAIAuthMode {
    if (env.GEMINI_API_KEY) return 'gemini_api';
    if (!env.ALLOW_PAID_AI) return 'none';
    if (env.OPENAI_API_KEY) return 'openai_api';
    if (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || oidcToken) return 'vercel_ai_gateway';
    return 'none';
  }

  enabledFor(oidcToken?: string) { return this.modeFor(oidcToken) !== 'none'; }
  get enabled() { return this.enabledFor(); }
  get mode() { return this.modeFor(); }

  modelFor(oidcToken?: string) {
    const mode = this.modeFor(oidcToken);
    if (mode === 'gemini_api') return env.GEMINI_MODEL;
    if (mode === 'vercel_ai_gateway') return env.AI_GATEWAY_MODEL;
    return env.OPENAI_MODEL;
  }

  get model() { return this.modelFor(); }

  async testConnection(oidcToken?: string): Promise<OpenAIConnectionProbe> {
    const mode = this.modeFor(oidcToken);
    const model = this.modelFor(oidcToken);
    const base = { enabled: mode !== 'none', model, mode } as const;

    if (mode === 'none') {
      return {
        ok: false,
        ...base,
        message: env.ALLOW_PAID_AI
          ? 'No AI provider is configured.'
          : 'Free AI is not configured. Add GEMINI_API_KEY. Paid AI remains locked unless ALLOW_PAID_AI=true.',
      };
    }

    try {
      if (mode === 'gemini_api') {
        const response = await this.requestGeminiWithRetry('Reply with OK.', 'Reply with OK.', 2);
        if (!response.ok) {
          const detail = sanitizeProviderError(await response.text());
          return { ok: false, ...base, message: `Gemini returned ${response.status}${detail ? `: ${detail}` : '.'}` };
        }
        return { ok: true, ...base };
      }

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
      if (!response.ok) {
        const detail = sanitizeProviderError(await response.text());
        return { ok: false, ...base, message: `Vercel AI Gateway returned ${response.status}${detail ? `: ${detail}` : '.'}` };
      }
      return { ok: true, ...base };
    } catch (error) {
      return { ok: false, ...base, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async generateText(instructions: string, input: string, oidcToken?: string): Promise<string> {
    const mode = this.modeFor(oidcToken);
    if (mode === 'none') {
      throw new Error('AI is not configured. Free mode requires GEMINI_API_KEY; paid providers are locked by default.');
    }

    if (mode === 'gemini_api') {
      const response = await this.requestGeminiWithRetry(instructions, input, 4);
      if (!response.ok) {
        throw new Error(`Gemini request failed: ${response.status} ${sanitizeProviderError(await response.text())}`);
      }
      const data = await response.json() as GeminiResponse;
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      return parts.map((part) => part.text ?? '').join('').trim();
    }

    const response = await this.requestResponses({
      model: this.modelFor(oidcToken),
      instructions,
      input,
      store: false,
    }, oidcToken);
    if (!response.ok) throw new Error(`AI request failed: ${response.status} ${sanitizeProviderError(await response.text())}`);
    const data = await response.json() as OpenAIResponse;
    if (data.output_text) return data.output_text;
    for (const item of data.output ?? []) {
      for (const part of item.content ?? []) if (typeof part.text === 'string') return part.text;
    }
    return '';
  }

  private requestGemini(instructions: string, input: string) {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is unavailable.');
    const model = encodeURIComponent(env.GEMINI_MODEL);
    return fetch(`${env.GEMINI_API_BASE_URL}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
      }),
    });
  }

  private async requestGeminiWithRetry(instructions: string, input: string, attempts: number): Promise<Response> {
    let response = await this.requestGemini(instructions, input);
    for (let attempt = 1; attempt < attempts && shouldRetryGemini(response.status); attempt += 1) {
      const retryAfter = retryAfterMs(response.headers.get('retry-after'));
      const backoff = retryAfter ?? Math.min(8000, 700 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 350));
      await delay(backoff);
      response = await this.requestGemini(instructions, input);
    }
    return response;
  }

  private requestResponses(body: Record<string, unknown>, oidcToken?: string) {
    if (!env.ALLOW_PAID_AI) throw new Error('Paid AI providers are disabled.');
    const mode = this.modeFor(oidcToken);
    const gateway = mode === 'vercel_ai_gateway';
    const token = gateway
      ? env.AI_GATEWAY_API_KEY ?? env.VERCEL_OIDC_TOKEN ?? oidcToken
      : env.OPENAI_API_KEY;
    if (!token) throw new Error('AI authentication token is unavailable.');
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

function shouldRetryGemini(status: number): boolean {
  return status === 429 || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30000, seconds * 1000);
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, Math.min(30000, at - Date.now()));
}

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function sanitizeProviderError(raw: string): string {
  return raw
    .replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]')
    .replace(/(access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret)\s*[=:]\s*["']?[^,"'}\s]+/gi, '$1=[REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 500);
}
