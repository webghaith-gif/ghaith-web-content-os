export function safeStartupDiagnostic(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = raw
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/https?:\/\/[^\s"']+/gi, '[REDACTED_URL]')
    .replace(/(?:password|token|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');

  return {
    ok: false,
    error: 'STARTUP_ERROR',
    message: redacted || 'Application startup failed.',
    storageDriver: process.env.STORAGE_DRIVER?.trim() || null,
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    databaseSsl: process.env.DATABASE_SSL?.trim() || null,
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim() || null,
    node: process.version,
  };
}
