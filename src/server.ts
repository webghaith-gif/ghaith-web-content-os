import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './application';
import { env } from './config/env';
import { Store } from './repositories/store';
import { createDatabase } from './repositories/database-factory';
import { SearchConsoleAdapter } from './integrations/search-console.adapter';
import { MakeAdapter } from './integrations/make.adapter';
import { ReportPipelineService } from './services/report-pipeline.service';
import { safeStartupDiagnostic } from './utils/startup-diagnostic';

// Lightweight extension routes intentionally wrap the stable application instead of
// changing the publishing core. This keeps report/product automation isolated from
// ClickUp -> Make -> publishing behavior.
function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function sendWebAsset(res: ServerResponse, file: string, type: string) {
  const content = await readFile(path.join(__dirname, 'web', file));
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache, must-revalidate',
  });
  res.end(content);
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return undefined;
}

try {
  const app = createApp();
  const baseHandler = app.listeners('request')[0] as ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined;
  const store = new Store(createDatabase());
  const searchConsole = new SearchConsoleAdapter(store);
  const make = new MakeAdapter();
  const pipeline = new ReportPipelineService(store);

  if (baseHandler) {
    app.removeAllListeners('request');
    app.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const method = req.method ?? 'GET';
      const oidcToken = header(req, 'x-vercel-oidc-token');

      if (method === 'GET' && url.pathname === '/products.js') {
        return sendWebAsset(res, 'products.js', 'text/javascript; charset=utf-8');
      }

      if (method === 'GET' && url.pathname === '/api/integrations/make/test') {
        try {
          const probe = await make.testConnection();
          return sendJson(res, probe.ok ? 200 : 503, probe);
        } catch (error) {
          return sendJson(res, 500, {
            ok: false,
            enabled: make.enabled,
            mode: make.enabled ? 'webhook' : 'disabled',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (method === 'GET' && url.pathname === '/api/integrations/search-console/test') {
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

      if (method === 'GET' && url.pathname === '/api/integrations/search-console/performance') {
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

      try {
        if (method === 'GET' && url.pathname === '/api/products') {
          return sendJson(res, 200, await store.listProducts());
        }

        let match = url.pathname.match(/^\/api\/products\/([^/]+)$/);
        if (match && method === 'GET') {
          return sendJson(res, 200, await store.getProduct(match[1]!));
        }

        match = url.pathname.match(/^\/api\/products\/([^/]+)\/(approve|archive)$/);
        if (match && method === 'POST') {
          const product = match[2] === 'approve'
            ? await pipeline.approveProduct(match[1]!)
            : await pipeline.archiveProduct(match[1]!);
          return sendJson(res, 200, product);
        }

        match = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/product$/);
        if (match && method === 'POST') {
          return sendJson(res, 201, await pipeline.createProduct(match[1]!, oidcToken));
        }

        if (method === 'GET' && url.pathname === '/api/automation/reports/next') {
          return sendJson(res, 200, { report: await pipeline.nextPendingReport() });
        }

        match = url.pathname.match(/^\/api\/automation\/reports\/([^/]+)\/status$/);
        if (match && method === 'GET') {
          return sendJson(res, 200, await pipeline.status(match[1]!));
        }

        if (method === 'POST' && url.pathname === '/api/automation/process-next-stage') {
          return sendJson(res, 200, await pipeline.processNextStage(oidcToken));
        }
      } catch (error) {
        console.error('Report/product automation route failed', error);
        return sendJson(res, 500, {
          error: 'AUTOMATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        });
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
