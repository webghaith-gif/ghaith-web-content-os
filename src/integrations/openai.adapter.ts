import { env } from '../config/env';

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}

export class OpenAIAdapter {
  get enabled() { return Boolean(env.OPENAI_API_KEY); }

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
