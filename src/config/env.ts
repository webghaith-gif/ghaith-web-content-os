function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function optionalUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  new URL(value);
  return value;
}

export const env = {
  PORT: numberEnv('PORT', 3000),
  APP_BASE_URL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  DATA_FILE: process.env.DATA_FILE ?? './data/db.json',
  PUBLISH_MAX_RETRIES: numberEnv('PUBLISH_MAX_RETRIES', 3),
  PUBLISH_RETRY_BASE_MS: numberEnv('PUBLISH_RETRY_BASE_MS', 500),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-5.6',
  CLICKUP_API_TOKEN: process.env.CLICKUP_API_TOKEN,
  CLICKUP_LIST_ID: process.env.CLICKUP_LIST_ID,
  CLICKUP_STATUS_IN_REVIEW: process.env.CLICKUP_STATUS_IN_REVIEW ?? 'in review',
  CLICKUP_STATUS_READY: process.env.CLICKUP_STATUS_READY ?? 'ready',
  CLICKUP_STATUS_PUBLISHED: process.env.CLICKUP_STATUS_PUBLISHED ?? 'published',
  PUBLISH_MODE: (process.env.PUBLISH_MODE ?? 'clickup_watch').trim().toLowerCase(),
  MAKE_WEBHOOK_URL: optionalUrl('MAKE_WEBHOOK_URL'),
  MAKE_WEBHOOK_SECRET: process.env.MAKE_WEBHOOK_SECRET,
  GOOGLE_DRIVE_ACCESS_TOKEN: process.env.GOOGLE_DRIVE_ACCESS_TOKEN,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  SEMRUSH_API_URL: optionalUrl('SEMRUSH_API_URL'),
  SEMRUSH_API_KEY: process.env.SEMRUSH_API_KEY,
  CANVA_AUTOMATION_WEBHOOK_URL: optionalUrl('CANVA_AUTOMATION_WEBHOOK_URL'),
  HEYGEN_AUTOMATION_WEBHOOK_URL: optionalUrl('HEYGEN_AUTOMATION_WEBHOOK_URL'),
  SUPPORTED_PLATFORMS: process.env.SUPPORTED_PLATFORMS ?? 'facebook,instagram,tiktok,pinterest,youtube,x',
};

export const supportedPlatforms = new Set(
  env.SUPPORTED_PLATFORMS.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean),
);
