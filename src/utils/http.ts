import { AppError } from '../core/errors';

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  retries = 0,
  retryBaseMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const text = await response.text();
      const data = text ? safeJson(text) : {};
      if (!response.ok) {
        const error = new AppError(
          `HTTP ${response.status}: ${typeof data === 'object' ? JSON.stringify(data) : String(data)}`,
          502,
          'UPSTREAM_ERROR',
        );
        if (response.status === 429 || response.status >= 500) throw error;
        throw error;
      }
      return data as T;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(retryBaseMs * 2 ** attempt);
    }
  }
  throw lastError;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
