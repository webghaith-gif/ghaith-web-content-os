import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_MEDIA_BYTES = 3_000_000;
const MAX_JSON_BYTES = 4_300_000;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'image/heic', 'image/heif', 'image/gif', 'image/avif',
  'application/pdf',
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
    /^https:\/\/app-[a-z0-9-]+\.canva-apps\.com$/i.test(origin) ||
    /^https:\/\/([a-z0-9-]+\.)*canva-apps-dev\.com$/i.test(origin) ||
    /^https:\/\/([a-z0-9-]+\.)*canva\.com$/i.test(origin) ||
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
  if (item.count >= 40) return false;
  item.count += 1;
  return true;
}

async function jsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as any;
}

function geminiConfig() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_NOT_CONFIGURED');
  const model = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const base = String(process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  return { apiKey, model, base };
}

async function extractMedia(data: string, mimeType: string, name: string) {
  const { apiKey, model, base } = geminiConfig();
  const mediaKind = mimeType === 'application/pdf' ? 'PDF' : 'image';
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Extract educational source material accurately. Preserve the language of the source. Return only useful instructional content and concise descriptions of meaningful diagrams, tables, maps, labels, formulas, or visual evidence. Ignore filenames, decorative labels, author names, watermarks, interface text, and unrelated metadata unless they are pedagogically relevant. Do not invent facts and do not add markdown fences.' }] },
      contents: [{ role: 'user', parts: [
        { text: `Read this uploaded ${mediaKind} (${name}). Extract all educationally useful text and facts. If there is a diagram, chart, map, table, worksheet, or illustration, describe the information it conveys so it can be merged with other uploaded sources.` },
        { inlineData: { mimeType, data } },
      ] }],
      generationConfig: { temperature: 0.05, maxOutputTokens: 4096 },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_EXTRACT_FAILED:${response.status}`);
  const payload = await response.json() as any;
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('\n').trim();
  if (!text) throw new Error('NO_MEDIA_TEXT');
  return text;
}

function questionCount(documentType: string) {
  return documentType === 'source_pack' ? 4 : documentType === 'lesson_plan' ? 3 : 6;
}

async function generateGrounded(body: any) {
  const { apiKey, model, base } = geminiConfig();
  const sourceText = String(body?.sourceText || '').slice(0, 42_000).trim();
  const topic = String(body?.topic || '').slice(0, 220).trim();
  const subject = String(body?.subject || '').slice(0, 160).trim();
  const grade = String(body?.grade || '').slice(0, 120).trim();
  const documentType = String(body?.documentType || 'worksheet').slice(0, 40);
  const language = ['ar', 'fr', 'en'].includes(String(body?.language)) ? String(body.language) : 'en';
  if (!topic) throw new Error('TOPIC_REQUIRED');
  if (!sourceText) throw new Error('SOURCE_REQUIRED');
  const count = questionCount(documentType);

  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `You are a careful primary-school instructional designer. Work only from the supplied source. Do not treat filenames, author names, watermarks, separators, page labels, or OCR noise as learning facts. Remove duplicates and obvious OCR artifacts. Produce age-appropriate, non-repetitive questions whose answers are directly supported by the source. Questions must progress from recall/comprehension to explanation/application. Never ask a question whose answer is merely the topic title or a person's name unless that person is genuinely central to the lesson. Return valid JSON only.` }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({
        task: 'Create grounded educational output from the combined source.',
        language,
        subject,
        grade,
        documentType,
        topic,
        requiredQuestionCount: count,
        sourceText,
        requiredShape: {
          cleanSource: 'clean pedagogically relevant source, preserving all important facts',
          competency: 'one concise competency appropriate to topic and grade',
          objective: 'one observable learning objective',
          questions: [{ prompt: 'question', answer: 'model answer grounded in source' }],
          lessonPlan: {
            phases: [
              { title: 'opening', teacher: 'topic-specific teacher action', learner: 'topic-specific learner action' },
              { title: 'build learning', teacher: 'topic-specific teacher action', learner: 'topic-specific learner action' },
              { title: 'practice/application', teacher: 'topic-specific teacher action', learner: 'topic-specific learner action' },
              { title: 'assessment/closure', teacher: 'topic-specific teacher action', learner: 'topic-specific learner action' }
            ]
          }
        }
      }) }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 6144,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_GENERATE_FAILED:${response.status}`);
  const payload = await response.json() as any;
  const raw = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('\n').trim();
  const parsed = JSON.parse(raw);
  const questions = Array.isArray(parsed?.questions)
    ? parsed.questions
        .filter((q: any) => q && typeof q.prompt === 'string' && typeof q.answer === 'string')
        .slice(0, count)
    : [];
  if (questions.length < Math.min(3, count)) throw new Error('INSUFFICIENT_GROUNDED_QUESTIONS');
  return {
    cleanSource: typeof parsed?.cleanSource === 'string' && parsed.cleanSource.trim() ? parsed.cleanSource.trim() : sourceText,
    competency: typeof parsed?.competency === 'string' ? parsed.competency.trim() : '',
    objective: typeof parsed?.objective === 'string' ? parsed.objective.trim() : '',
    questions,
    lessonPlan: parsed?.lessonPlan && Array.isArray(parsed.lessonPlan.phases) ? parsed.lessonPlan : null,
  };
}

async function authorize(req: IncomingMessage) {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('UNAUTHORIZED');
  const verified = await verifyToken(match[1]!);
  if (!rateLimit(`${verified.aud}:${verified.userId}`)) throw new Error('RATE_LIMITED');
  return verified;
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/UNAUTHORIZED|CANVA|TOKEN|SIGNATURE|AUDIENCE|EXPIRED/.test(message)) return 401;
  if (/RATE_LIMITED/.test(message)) return 429;
  if (/PAYLOAD_TOO_LARGE|MEDIA_TOO_LARGE/.test(message)) return 413;
  if (/TOPIC_REQUIRED|SOURCE_REQUIRED|INVALID_MEDIA_DATA/.test(message)) return 400;
  return 500;
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
    await authorize(req);
    const body = await jsonBody(req);
    const name = String(body?.name || 'source').slice(0, 180);
    const mimeType = String(body?.mimeType || '').toLowerCase();
    const data = String(body?.data || '').replace(/\s+/g, '');
    if (!ALLOWED_MEDIA_TYPES.has(mimeType)) return send(res, 415, { error: 'UNSUPPORTED_MEDIA_TYPE' });
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error('INVALID_MEDIA_DATA');
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length) return send(res, 400, { error: 'EMPTY_MEDIA' });
    if (bytes.length > MAX_MEDIA_BYTES) throw new Error('MEDIA_TOO_LARGE');
    return send(res, 200, { ok: true, text: await extractMedia(data, mimeType, name), name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('DarsKit media extraction failed', message);
    return send(res, statusFor(error), { error: 'DARSKIT_MEDIA_FAILED', message });
  }
}

export async function handleDarsKitGenerate(req: IncomingMessage, res: ServerResponse) {
  cors(req, res);
  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    await authorize(req);
    const body = await jsonBody(req);
    const generated = await generateGrounded(body);
    return send(res, 200, { ok: true, ...generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('DarsKit grounded generation failed', message);
    return send(res, statusFor(error), { error: 'DARSKIT_GENERATION_FAILED', message });
  }
}
