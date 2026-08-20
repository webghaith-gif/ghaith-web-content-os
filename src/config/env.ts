function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'require'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disable'].includes(raw)) return false;
  throw new Error(`${name} must be a boolean.`);
}

function storageDriver(): 'json' | 'postgres' {
  const raw = (process.env.STORAGE_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'json')).trim().toLowerCase();
  if (raw !== 'json' && raw !== 'postgres') throw new Error('STORAGE_DRIVER must be json or postgres.');
  return raw;
}

function optionalUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  try {
    new URL(value);
    return value;
  } catch {
    console.warn(`Ignoring invalid optional URL in ${name}.`);
    return undefined;
  }
}

export const env = {
  PORT: numberEnv('PORT', 3000),
  APP_BASE_URL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  STORAGE_DRIVER: storageDriver(),
  DATA_FILE: process.env.DATA_FILE ?? './data/db.json',
  DATABASE_URL: process.env.DATABASE_URL?.trim() || undefined,
  DATABASE_SSL: booleanEnv('DATABASE_SSL', process.env.NODE_ENV === 'production'),
  DATABASE_SSL_REJECT_UNAUTHORIZED: booleanEnv('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
  PUBLISH_MAX_RETRIES: numberEnv('PUBLISH_MAX_RETRIES', 3),
  PUBLISH_RETRY_BASE_MS: numberEnv('PUBLISH_RETRY_BASE_MS', 500),

  // Free-first AI mode. Gemini Free Tier is preferred whenever a key is configured.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() || undefined,
  GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  GEMINI_API_BASE_URL: optionalUrl('GEMINI_API_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta',
  // Safety lock: paid providers are disabled unless the owner explicitly opts in.
  ALLOW_PAID_AI: booleanEnv('ALLOW_PAID_AI', false),

  // Direct OpenAI remains available only when ALLOW_PAID_AI=true and a key is provided.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || undefined,
  OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini',
  // Vercel AI Gateway is also treated as a paid-capable path and is locked by default.
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY?.trim() || undefined,
  VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN?.trim() || undefined,
  AI_GATEWAY_BASE_URL: optionalUrl('AI_GATEWAY_BASE_URL') ?? 'https://ai-gateway.vercel.sh/v1',
  AI_GATEWAY_MODEL: process.env.AI_GATEWAY_MODEL?.trim() || 'openai/gpt-5.4-mini',

  CLICKUP_API_TOKEN: process.env.CLICKUP_API_TOKEN?.trim() || undefined,
  CLICKUP_LIST_ID: process.env.CLICKUP_LIST_ID?.trim() || '901524471002',
  CLICKUP_STATUS_IN_REVIEW: process.env.CLICKUP_STATUS_IN_REVIEW?.trim() || 'in review',
  CLICKUP_STATUS_READY: process.env.CLICKUP_STATUS_READY?.trim() || 'ready',
  CLICKUP_STATUS_PUBLISHED: process.env.CLICKUP_STATUS_PUBLISHED?.trim() || 'published',

  PUBLISH_MODE: (process.env.PUBLISH_MODE ?? 'clickup_watch').trim().toLowerCase(),
  // Vendor-neutral automation bridge. It can point to Make, n8n, or any compatible webhook.
  // Legacy MAKE_* variables remain supported so the current scenario needs no migration.
  PUBLISH_WEBHOOK_URL: optionalUrl('PUBLISH_WEBHOOK_URL') ?? optionalUrl('AUTOMATION_WEBHOOK_URL') ?? optionalUrl('MAKE_WEBHOOK_URL'),
  PUBLISH_WEBHOOK_SECRET:
    process.env.PUBLISH_WEBHOOK_SECRET?.trim()
    || process.env.AUTOMATION_WEBHOOK_SECRET?.trim()
    || process.env.MAKE_WEBHOOK_SECRET?.trim()
    || undefined,
  MAKE_WEBHOOK_URL: optionalUrl('MAKE_WEBHOOK_URL'),
  MAKE_WEBHOOK_SECRET: process.env.MAKE_WEBHOOK_SECRET?.trim() || undefined,

  GOOGLE_DRIVE_ACCESS_TOKEN: process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim() || undefined,
  GOOGLE_DRIVE_CLIENT_ID: process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || undefined,
  GOOGLE_DRIVE_CLIENT_SECRET: process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || undefined,
  GOOGLE_DRIVE_REFRESH_TOKEN: process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim() || undefined,
  // Least-privilege default: the app may manage only files it creates or that the user explicitly grants to it.
  GOOGLE_DRIVE_SCOPES: process.env.GOOGLE_DRIVE_SCOPES?.trim() || 'https://www.googleapis.com/auth/drive.file',
  // Optional explicit folder override. When omitted, OAuth mode creates and remembers an app-owned export folder.
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || undefined,
  GOOGLE_DRIVE_FOLDER_NAME: process.env.GOOGLE_DRIVE_FOLDER_NAME?.trim() || 'Ghaith Web Content OS — Runtime Exports',

  SEMRUSH_API_URL: optionalUrl('SEMRUSH_API_URL') ?? 'https://api.semrush.com/apis/v4/keywords/v1/metrics',
  SEMRUSH_API_KEY: process.env.SEMRUSH_API_KEY?.trim() || undefined,
  SEMRUSH_COUNTRY: (process.env.SEMRUSH_COUNTRY?.trim() || 'TN').toUpperCase(),
  SEMRUSH_ENRICHMENT_LIMIT: Math.max(0, Math.min(10, numberEnv('SEMRUSH_ENRICHMENT_LIMIT', 3))),

  CANVA_ACCESS_TOKEN: process.env.CANVA_ACCESS_TOKEN?.trim() || undefined,
  CANVA_CLIENT_ID: process.env.CANVA_CLIENT_ID?.trim() || undefined,
  CANVA_CLIENT_SECRET: process.env.CANVA_CLIENT_SECRET?.trim() || undefined,
  CANVA_SCOPES: process.env.CANVA_SCOPES?.trim() || 'design:content:read design:content:write design:meta:read asset:read asset:write profile:read',
  CANVA_BRAND_KIT_ID: process.env.CANVA_BRAND_KIT_ID?.trim() || 'kAHON_7IACY',
  CANVA_SOCIAL_DESIGN_ID: process.env.CANVA_SOCIAL_DESIGN_ID?.trim() || 'DAHSrPK5pN0',
  CANVA_CAROUSEL_DESIGN_ID: process.env.CANVA_CAROUSEL_DESIGN_ID?.trim() || 'DAHSrGq1HWk',
  CANVA_VIDEO_DESIGN_ID: process.env.CANVA_VIDEO_DESIGN_ID?.trim() || 'DAHSrIr1gMw',
  CANVA_SOCIAL_TEMPLATE_ID: process.env.CANVA_SOCIAL_TEMPLATE_ID?.trim() || undefined,
  CANVA_CAROUSEL_TEMPLATE_ID: process.env.CANVA_CAROUSEL_TEMPLATE_ID?.trim() || undefined,
  CANVA_VIDEO_TEMPLATE_ID: process.env.CANVA_VIDEO_TEMPLATE_ID?.trim() || undefined,
  CANVA_VIDEO_EXPORT_QUALITY: process.env.CANVA_VIDEO_EXPORT_QUALITY?.trim() || 'vertical_1080p',
  CANVA_AUTOFILL_TITLE_FIELD: process.env.CANVA_AUTOFILL_TITLE_FIELD?.trim() || 'TITLE',
  CANVA_AUTOFILL_BODY_FIELD: process.env.CANVA_AUTOFILL_BODY_FIELD?.trim() || 'BODY',
  CANVA_AUTOFILL_CTA_FIELD: process.env.CANVA_AUTOFILL_CTA_FIELD?.trim() || 'CTA',
  CANVA_AUTOFILL_MEDIA_FIELD: process.env.CANVA_AUTOFILL_MEDIA_FIELD?.trim() || 'MEDIA',
  CANVA_AUTOMATION_WEBHOOK_URL: optionalUrl('CANVA_AUTOMATION_WEBHOOK_URL'),

  HEYGEN_API_KEY: process.env.HEYGEN_API_KEY?.trim() || undefined,
  HEYGEN_API_URL: optionalUrl('HEYGEN_API_URL') ?? 'https://api.heygen.com',
  HEYGEN_AVATAR_ID: process.env.HEYGEN_AVATAR_ID?.trim() || undefined,
  HEYGEN_VOICE_ID: process.env.HEYGEN_VOICE_ID?.trim() || undefined,
  HEYGEN_AVATAR_TYPE: (process.env.HEYGEN_AVATAR_TYPE?.trim() || 'photo_avatar').toLowerCase(),
  HEYGEN_AUTOMATION_WEBHOOK_URL: optionalUrl('HEYGEN_AUTOMATION_WEBHOOK_URL'),
  HEYGEN_AUTOMATION_WEBHOOK_SECRET: process.env.HEYGEN_AUTOMATION_WEBHOOK_SECRET?.trim() || undefined,
  HEYGEN_CALLBACK_SECRET: process.env.HEYGEN_CALLBACK_SECRET?.trim() || undefined,

  // Remotion renders in an isolated Vercel Sandbox. It is on by default only inside Vercel.
  REMOTION_ENABLED: booleanEnv('REMOTION_ENABLED', process.env.VERCEL === '1'),

  SUPPORTED_PLATFORMS: process.env.SUPPORTED_PLATFORMS?.trim() || 'facebook,instagram,tiktok,pinterest,youtube,x',
};

export const supportedPlatforms = new Set(
  env.SUPPORTED_PLATFORMS.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean),
);
