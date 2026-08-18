import { env } from '../config/env';

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}

export interface OpenAIConnectionProbe { ok: boolean; enabled: boolean; model: string; message?: string; }

export class OpenAIAdapter {
  get enabled() { return Boolean(env.OPENAI_API_KEY); }

  async testConnection(): Promise<OpenAIConnectionProbe> {
    if (!env.OPENAI_API_KEY) return { ok: false, enabled: false, model: env.OPENAI_MODEL, message: 'OPENAI_API_KEY is not configured.' };
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      });
      if (!response.ok) return { ok: false, enabled: true, model: env.OPENAI_MODEL, message: `OpenAI returned ${response.status}.` };
      return { ok: true, enabled: true, model: env.OPENAI_MODEL };
    } catch (error) {
      return { ok: false, enabled: true, model: env.OPENAI_MODEL, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async generateText(instructions: string, input: string): Promise<string> {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: env.OPENAI_MODEL, instructions, input, store: false }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as OpenAIResponse;
    if (data.output_text) return data.output_text;
    for (const item of data.output ?? []) {
      for (const part of item.content ?? []) if (typeof part.text === 'string') return part.text;
    }
    return '';
  }
}
