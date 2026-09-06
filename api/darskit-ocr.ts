import { createPublicKey, verify as verifySignature } from 'node:crypto';

const MAX_IMAGE_BYTES = 2_700_000;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/avif',
]);

const jwksCache = new Map<string, { expiresAt: number; keys: any[] }>();
const usage = new Map<string, { windowStart: number; count: number }>();

function allowCors(req: any, res: any) {
  const origin = String(req.headers?.origin || '');
  const allowed =
    !origin ||
    /^https:\/\/([a-z0-9-]+\.)*canva\.com$/i.test(origin) ||
    /^https:\/\/([a-z0-9-]+\.)*canva-apps-dev\.com$/i.test(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (allowed && origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function base64UrlJson(value: string) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function getJwks(appId: string) {
  const now = Date.now();
  const cached = jwksCache.get(appId);
  if (cached && cached.expiresAt > now) return cached.keys;

  const response = await fetch(
    `https://api.canva.com/rest/v1/apps/${encodeURIComponent(appId)}/jwks`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error('CANVA_JWKS_UNAVAILABLE');
  const payload = (await response.json()) as any;
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) throw new Error('CANVA_JWKS_EMPTY');
  jwksCache.set(appId, { expiresAt: now + 60 * 60 * 1000, keys });
  return keys;
}

async function verifyCanvaUserToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('INVALID_CANVA_TOKEN');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64UrlJson(encodedHeader!);
  const payload = base64UrlJson(encodedPayload!);

  if (header?.alg !== 'RS256' || !header?.kid) throw new Error('INVALID_CANVA_TOKEN');
  if (typeof payload?.aud !== 'string' || !payload.aud) throw new Error('INVALID_CANVA_TOKEN');
  if (typeof payload?.userId !== 'string' || !payload.userId) throw new Error('INVALID_CANVA_TOKEN');
  if (typeof payload?.brandId !== 'string' || !payload.brandId) throw new Error('INVALID_CANVA_TOKEN');

  const expectedAppId = String(process.env.DARSKIT_CANVA_APP_ID || '').trim();
  if (expectedAppId && payload.aud !== expectedAppId) throw new Error('INVALID_CANVA_AUDIENCE');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now - 30) throw new Error('EXPIRED_CANVA_TOKEN');
  if (typeof payload.nbf === 'number' && payload.nbf > now + 30) throw new Error('INVALID_CANVA_TOKEN');

  const keys = await getJwks(payload.aud);
  const jwk = keys.find((key: any) => key?.kid === header.kid);
  if (!jwk) throw new Error('CANVA_KEY_NOT_FOUND');

  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(encodedSignature!, 'base64url'),
  );
  if (!valid) throw new Error('INVALID_CANVA_SIGNATURE');
  return payload as { aud: string; userId: string; brandId: string };
}

function checkRateLimit(userId: string) {
  const now = Date.now();
  const previous = usage.get(userId);
  if (!previous || now - previous.windowStart >= 60_000) {
    usage.set(userId, { windowStart: now, count: 1 });
    return true;
  }
  if (previous.count >= 30) return false;
  previous.count += 1;
  return true;
}

async function readBody(req: any) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > 4_300_000) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function extractWithGemini(data: string, mimeType: string, name: string) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_NOT_CONFIGURED');
  const model = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const baseUrl = String(
    process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  ).replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: 'You extract educational source material from images for teachers. Return only useful source text and concise descriptions of meaningful diagrams, tables, labels, formulas, or visual evidence. Preserve Arabic, French, or English as shown. Do not invent facts that are not visible. Do not add greetings or markdown fences.',
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Read this image (${name}). Extract every readable educational text accurately. If it contains a diagram, chart, map, table, worksheet, or illustration, briefly describe the information it conveys so it can be used together with the other uploaded sources.`,
            },
            { inlineData: { mimeType, data } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 800);
    throw new Error(`GEMINI_OCR_FAILED:${response.status}:${detail}`);
  }
  const payload = (await response.json()) as any;
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
  if (!text) throw new Error('NO_IMAGE_TEXT');
  return text;
}

export default async function handler(req: any, res: any) {
  allowCors(req, res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const authorization = String(req.headers?.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const verified = await verifyCanvaUserToken(match[1]!);
    if (!checkRateLimit(`${verified.aud}:${verified.userId}`)) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }

    const body = await readBody(req);
    const name = String(body?.name || 'image').slice(0, 180);
    const mimeType = String(body?.mimeType || '').toLowerCase();
    const data = String(body?.data || '');

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(415).json({ error: 'UNSUPPORTED_IMAGE_TYPE' });
    }
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(data)) {
      return res.status(400).json({ error: 'INVALID_IMAGE_DATA' });
    }

    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length) return res.status(400).json({ error: 'EMPTY_IMAGE' });
    if (bytes.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'IMAGE_TOO_LARGE', maxBytes: MAX_IMAGE_BYTES });
    }

    const text = await extractWithGemini(data.replace(/\s+/g, ''), mimeType, name);
    return res.status(200).json({ ok: true, text, name });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const authError = /CANVA|TOKEN|SIGNATURE|AUDIENCE|EXPIRED/.test(message);
    const status = authError ? 401 : /PAYLOAD_TOO_LARGE/.test(message) ? 413 : 500;
    console.error('DarsKit OCR failed', message);
    return res.status(status).json({ error: 'DARS_KIT_OCR_FAILED', message });
  }
}
