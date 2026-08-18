function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function stringEnv(name: string, fallback: string): string {
  return nonEmptyEnv(name) ?? fallback;
}

function numberEnv(name: string, fallback: number): number {
  const raw = nonEmptyEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = nonEmptyEnv(name)?.toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'require'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disable'].includes(raw)) return false;
  throw new Error(`${name} must be a boolean.`);
}

function storageDriver(): 'json' | 'postgres' {
  const raw = (nonEmptyEnv('STORAGE_DRIVER') ?? (nonEmptyEnv('DATABASE_URL') ? 'postgres' : 'json')).toLowerCase();
  if (raw !== 'json' && raw !== 'postgres') throw new Error('STORAGE_DRIVER must be json or postgres.');
  return raw;
}

function optionalUrl(name: string): string | undefined {
  const value = nonEmptyEnv(name);
  if (!value) return undefined;
  new URL(value);
  return value;
}

export const env = {
  PORT: numberEnv('PORT', 3000),
  APP_BASE_URL: stringEnv('APP_BASE_URL', 'http://localhost:3000'),
  STORAGE_DRIVER: storageDriver(),
  DATA_FILE: stringEnv('DATA_FILE', './data/db.json'),
  DATABASE_URL: nonEmptyEnv('DATABASE_URL'),
  DATABASE_SSL: booleanEnv('DATABASE_SSL', process.env.NODE_ENV === 'production'),
  DATABASE_SSL_REJECT_UNAUTHORIZED: booleanEnv('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
  PUBLISH_MAX_RETRIES: numberEnv('PUBLISH_MAX_RETRIES', 3),
  PUBLISH_RETRY_BASE_MS: numberEnv('PUBLISH_RETRY_BASE_MS', 500),
  OPENAI_API_KEY: nonEmptyEnv('OPENAI_API_KEY'),
  OPENAI_MODEL: stringEnv('OPENAI_MODEL', 'gpt-5.6'),
  CLICKUP_API_TOKEN: nonEmptyEnv('CLICKUP_API_TOKEN'),
  CLICKUP_LIST_ID: nonEmptyEnv('CLICKUP_LIST_ID'),
  CLICKUP_STATUS_IN_REVIEW: stringEnv('CLICKUP_STATUS_IN_REVIEW', 'in review'),
  CLICKUP_STATUS_READY: stringEnv('CLICKUP_STATUS_READY', 'ready'),
  CLICKUP_STATUS_PUBLISHED: stringEnv('CLICKUP_STATUS_PUBLISHED', 'published'),
  PUBLISH_MODE: stringEnv('PUBLISH_MODE', 'clickup_watch').toLowerCase(),
  MAKE_WEBHOOK_URL: optionalUrl('MAKE_WEBHOOK_URL'),
  MAKE_WEBHOOK_SECRET: nonEmptyEnv('MAKE_WEBHOOK_SECRET'),
  GOOGLE_DRIVE_ACCESS_TOKEN: nonEmptyEnv('GOOGLE_DRIVE_ACCESS_TOKEN'),
  GOOGLE_DRIVE_FOLDER_ID: nonEmptyEnv('GOOGLE_DRIVE_FOLDER_ID'),
  SEMRUSH_API_URL: optionalUrl('SEMRUSH_API_URL'),
  SEMRUSH_API_KEY: nonEmptyEnv('SEMRUSH_API_KEY'),
  CANVA_AUTOMATION_WEBHOOK_URL: optionalUrl('CANVA_AUTOMATION_WEBHOOK_URL'),
  HEYGEN_AUTOMATION_WEBHOOK_URL: optionalUrl('HEYGEN_AUTOMATION_WEBHOOK_URL'),
  SUPPORTED_PLATFORMS: stringEnv('SUPPORTED_PLATFORMS', 'facebook,instagram,tiktok,pinterest,youtube,x'),
};

export const supportedPlatforms = new Set(
  env.SUPPORTED_PLATFORMS.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean),
);
