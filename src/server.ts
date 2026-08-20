import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createApp } from './application';
import { env } from './config/env';
import { Store } from './repositories/store';
import { createDatabase } from './repositories/database-factory';
import { SearchConsoleAdapter } from './integrations/search-console.adapter';
import { safeStartupDiagnostic } from './utils/startup-diagnostic';

// Search Console routes intentionally share the existing Google OAuth token store.
function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

try {
  const app = createApp();
  const baseHandler = app.listeners('request')[0] as ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined;
  const searchConsole = new SearchConsoleAdapter(new Store(createDatabase()));

  if (baseHandler) {
    app.removeAllListeners('request');
    app.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/api/integrations/search-console/test') {
        try {
          const probe = await searchConsole.testConnection();
          return sendJson(res, probe.ok ? 200 : 503, probe);
        } catch (error) {
          return sendJson(res, 500, {
            ok: false,
            enabled: true,
            connected: false,
            siteUrl: 'https://ghaith-web-content-os.vercel.app/',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/integrations/search-console/performance') {
        try {
          const days = Number(url.searchParams.get('days') ?? 28);
          return sendJson(res, 200, await searchConsole.getPerformance(Number.isFinite(days) ? days : 28));
        } catch (error) {
          return sendJson(res, 503, {
            ok: false,
            siteUrl: 'https://ghaith-web-content-os.vercel.app/',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return baseHandler(req, res);
    });
  }

  app.listen(env.PORT, () => {
    console.log(`Ghaith Web Content OS running on http://localhost:${env.PORT}`);
  });
} catch (error) {
  const diagnostic = safeStartupDiagnostic(error);
  console.error('Ghaith Web Content OS startup failed:', diagnostic);

  createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const status = url.pathname === '/api/health' || url.pathname === '/api/startup-health' ? 503 : 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(diagnostic));
  }).listen(Number(process.env.PORT ?? 3000));
}
