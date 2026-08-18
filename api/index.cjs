let requestHandler;

function safeDiagnostic(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = raw
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/https?:\/\/[^\s"']+/gi, '[REDACTED_URL]')
    .replace(/(?:password|token|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '[REDACTED_SECRET]');

  return {
    ok: false,
    error: 'VERCEL_API_BOOTSTRAP_ERROR',
    message: redacted || 'Vercel API bootstrap failed.',
    storageDriver: process.env.STORAGE_DRIVER?.trim() || null,
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    databaseSsl: process.env.DATABASE_SSL?.trim() || null,
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim() || null,
    node: process.version,
  };
}

function getRequestHandler() {
  if (requestHandler) return requestHandler;

  const { createApp } = require('../dist/src/app.js');
  const server = createApp();
  const handlers = server.listeners('request');
  if (!handlers.length || typeof handlers[0] !== 'function') {
    throw new Error('Compiled application did not expose an HTTP request handler.');
  }

  requestHandler = handlers[0];
  return requestHandler;
}

module.exports = async function handler(req, res) {
  try {
    const routedPath = req.query?.__path;
    const normalizedPath = Array.isArray(routedPath)
      ? routedPath.join('/')
      : typeof routedPath === 'string'
        ? routedPath
        : '';

    const incoming = new URL(req.url || '/', 'http://localhost');
    incoming.searchParams.delete('__path');
    const search = incoming.searchParams.toString();
    req.url = `/api${normalizedPath ? `/${normalizedPath}` : ''}${search ? `?${search}` : ''}`;

    return await getRequestHandler()(req, res);
  } catch (error) {
    const diagnostic = safeDiagnostic(error);
    console.error('Ghaith Web Content OS Vercel API bootstrap failed:', diagnostic);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(diagnostic));
  }
};
