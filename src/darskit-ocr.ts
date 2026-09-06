import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_IMAGE_BYTES = 2_700_000;
const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'image/heic', 'image/heif', 'image/gif', 'image/avif',
]);
const jwksCache = new Map<string, { expiresAt: number; keys: any[] }>();
const usage = new Map<string, { windowStart: number; count: number }>();

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = String(req.headers.origin || '');
  const allowed = !origin ||
    /^https:\/\/([a-z0-9-]+\.)*canva\.com$/i.test(origin) ||
    /^https:\/\/([a-z0-9-]+\.)*canva-apps-dev\.com$/i.test(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (allowed && origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function decodeJson(segment: string) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

async function jwks(appId: string) {
  const now = Date.now();
  const cached = jwksCache.get(appId);
  if (cached && cached.expiresAt > now) return cached.keys;
  const response = await fetch(`https://api.canva.com/rest/v1/apps/${encodeURIComponent(appId)}/jwks`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('CANVA_JWKS_UNAVAILABLE');
  const payload = await response.json() as any;
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) throw new Error('CANVA_JWKS_EMPTY');
  jwksCache.set(appId, { expiresAt: now + 3_600_000, keys });
  return keys;
}

async function verifyToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('INVALID_CANVA_TOKEN');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson(encodedHeader!);
  const payload = decodeJson(encodedPayload!);
  if (header?.alg !== 'RS256' || !header?.kid) throw new Error('INVALID_CANVA_TOKEN');
  if (typeof payload?.aud !== 'string' || !payload.aud ||
      typeof payload?.userId !== 'string' || !payload.userId ||
      typeof payload?.brandId !== 'string' || !payload.brandId) {
    throw new Error('INVALID_CANVA_TOKEN');
  }
  const expected = String(process.env.DARSKIT_CANVA_APP_ID || '').trim();
  if (expected && payload.aud !== expected) throw new Error('INVALID_CANVA_AUDIENCE');
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now - 30) throw new Error('EXPIRED_CANVA_TOKEN');
  if (typeof payload.nbf === 'number' && payload.nbf > now + 30) throw new Error('INVALID_CANVA_TOKEN');
  const key = (await jwks(payload.aud)).find((candidate: any) => candidate?.kid === header.kid);
  if (!key) throw new Error('CANVA_KEY_NOT_FOUND');
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ key, format: 'jwk' }),
    Buffer.from(encodedSignature!, 'base64url'),
  );
  if (!valid) throw new Error('INVALID_CANVA_SIGNATURE');
  return payload as { aud: string; userId: string; brandId: string };
}

function rateLimit(key: string) {
  const now = Date.now();
  const item = usage.get(key);
  if (!item || now - item.windowStart >= 60_000) {
    usage.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (item.count >= 30) return false;
  item.count += 1;
  return true;
}

async function jsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > 4_300_000) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as any;
}

async function gemini(data: string, mimeType: string, name: string) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_NOT_CONFIGURED');
  const model = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const base = String(process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Extract educational source material from images accurately. Return useful visible text plus concise descriptions of meaningful diagrams, tables, maps, labels, formulas, or visual evidence. Preserve Arabic, French, or English. Do not invent facts and do not add markdown fences.' }] },
      contents: [{ role: 'user', parts: [
        { text: `Read this uploaded source image (${name}). Extract all readable educational text. Also describe any meaningful diagram, table, chart, map, worksheet, or illustration so its information can be combined with the other uploaded sources.` },
        { inlineData: { mimeType, data } },
      ] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_OCR_FAILED:${response.status}`);
  const payload = await response.json() as any;
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('\n').trim();
  if (!text) throw new Error('NO_IMAGE_TEXT');
  return text;
}

export async function handleDarsKitOcr(req: IncomingMessage, res: ServerResponse) {
  cors(req, res);
  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return send(res, 401, { error: 'UNAUTHORIZED' });
    const verified = await verifyToken(match[1]!);
    if (!rateLimit(`${verified.aud}:${verified.userId}`)) return send(res, 429, { error: 'RATE_LIMITED' });
    const body = await jsonBody(req);
    const name = String(body?.name || 'image').slice(0, 180);
    const mimeType = String(body?.mimeType || '').toLowerCase();
    const data = String(body?.data || '').replace(/\s+/g, '');
    if (!ALLOWED_MIME_TYPES.has(mimeType)) return send(res, 415, { error: 'UNSUPPORTED_IMAGE_TYPE' });
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) return send(res, 400, { error: 'INVALID_IMAGE_DATA' });
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length) return send(res, 400, { error: 'EMPTY_IMAGE' });
    if (bytes.length > MAX_IMAGE_BYTES) return send(res, 413, { error: 'IMAGE_TOO_LARGE', maxBytes: MAX_IMAGE_BYTES });
    return send(res, 200, { ok: true, text: await gemini(data, mimeType, name), name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /CANVA|TOKEN|SIGNATURE|AUDIENCE|EXPIRED/.test(message) ? 401 : /PAYLOAD_TOO_LARGE/.test(message) ? 413 : 500;
    console.error('DarsKit OCR failed', message);
    return send(res, status, { error: 'DARS_KIT_OCR_FAILED', message });
  }
}
