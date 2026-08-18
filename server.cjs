const { createServer } = require('node:http');

function safeBootstrapDiagnostic(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = raw
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/https?:\/\/[^\s"']+/gi, '[REDACTED_URL]')
    .replace(/(?:password|token|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '[REDACTED_SECRET]');

  return {
    ok: false,
    error: 'BOOTSTRAP_IMPORT_ERROR',
    message: redacted || 'Application bootstrap failed.',
    storageDriver: process.env.STORAGE_DRIVER?.trim() || null,
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    databaseSsl: process.env.DATABASE_SSL?.trim() || null,
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim() || null,
    node: process.version,
  };
}

try {
  require('./dist/src/server.js');
} catch (error) {
  const diagnostic = safeBootstrapDiagnostic(error);
  console.error('Ghaith Web Content OS bootstrap import failed:', diagnostic);

  const parsedPort = Number(process.env.PORT || 3000);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  createServer((req, res) => {
    const pathname = (() => {
      try {
        return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
      } catch {
        return '/';
      }
    })();
    const status = pathname === '/api/health' || pathname === '/api/startup-health' ? 503 : 500;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(diagnostic));
  }).listen(port);
}
