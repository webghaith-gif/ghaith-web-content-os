import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createApp } from './application';
import { env } from './config/env';
import { Store } from './repositories/store';
import { createDatabase } from './repositories/database-factory';
import { SearchConsoleAdapter } from './integrations/search-console.adapter';
import { MakeAdapter } from './integrations/make.adapter';
import { GoogleDriveAdapter } from './integrations/google-drive.adapter';
import { ReportPipelineService } from './services/report-pipeline.service';
import { DriveReportIngestionService } from './services/drive-report-ingestion.service';
import { DriveViewerService } from './services/drive-viewer.service';
import { NotificationService } from './services/notification.service';
import { safeStartupDiagnostic } from './utils/startup-diagnostic';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return undefined;
}

async function sendDriveFile(res: ServerResponse, opened: Awaited<ReturnType<DriveViewerService['open']>>) {
  const upstream = opened.response;
  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') || (opened.sourceMimeType.startsWith('application/vnd.google-apps.') ? 'application/pdf' : opened.sourceMimeType),
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(opened.name)}`,
    'X-Content-Type-Options': 'nosniff',
  };
  for (const name of ['content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  res.writeHead(upstream.status, headers);
  if (!upstream.body) return res.end();
  const stream = Readable.fromWeb(upstream.body as any);
  stream.on('error', (error) => res.destroy(error as Error));
  stream.pipe(res);
}

try {
  const app = createApp();
  const baseHandler = app.listeners('request')[0] as ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined;
  const store = new Store(createDatabase());
  const searchConsole = new SearchConsoleAdapter(store);
  const make = new MakeAdapter();
  const pipeline = new ReportPipelineService(store);
  const driveReports = new DriveReportIngestionService(store);
  const drive = new GoogleDriveAdapter(store);
  const driveViewer = new DriveViewerService(store);
  const notifications = new NotificationService(store);

  if (baseHandler) {
    app.removeAllListeners('request');
    app.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const method = req.method ?? 'GET';
      const oidcToken = header(req, 'x-vercel-oidc-token');

      const driveViewMatch = url.pathname.match(/^\/api\/drive-view\/([^/]+)$/);
      if (driveViewMatch && method === 'GET') {
        try {
          const opened = await driveViewer.open(
            decodeURIComponent(driveViewMatch[1]!),
            url.searchParams.get('expires'),
            url.searchParams.get('signature'),
            header(req, 'range'),
          );
          return await sendDriveFile(res, opened);
        } catch (error: any) {
          const status = Number(error?.statusCode ?? 500);
          return sendJson(res, Number.isFinite(status) ? status : 500, {
            error: error?.code ?? 'DRIVE_VIEW_ERROR',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (method === 'POST' && url.pathname === '/api/webhooks/google-drive') {
        const resourceState = header(req, 'x-goog-resource-state');
        if (resourceState === 'sync') {
          res.writeHead(204, { 'Cache-Control': 'no-store' });
          return res.end();
        }
        try {
          const changedFiles = await drive.consumeChanges(
            header(req, 'x-goog-channel-id'),
            header(req, 'x-goog-channel-token'),
          );
          const visible = changedFiles.slice(0, 5);
          for (const file of visible) {
            try {
              await notifications.send({
                title: 'ملف محتوى جديد في Google Drive 📁',
                body: file.name,
                url: driveViewer.linkForFileId(file.id) ?? '/browser.html?view=reports',
                tag: `drive-file-${file.id}`,
              });
            } catch (error) {
              console.warn('Drive file notification failed', error);
            }
          }
          if (changedFiles.length > visible.length) {
            await notifications.send({
              title: 'ملفات محتوى جديدة في Google Drive 📁',
              body: `تمت إضافة ${changedFiles.length} ملفات جديدة إلى مجلدات غيث ويب.`,
              url: '/browser.html',
              tag: 'drive-files-summary',
            }).catch((error) => console.warn('Drive summary notification failed', error));
          }
          res.writeHead(204, { 'Cache-Control': 'no-store' });
          return res.end();
        } catch (error) {
          console.error('Drive webhook processing failed', error);
          return sendJson(res, 500, {
            error: 'DRIVE_WEBHOOK_ERROR',
            message: error instanceof Error ? error.message : String(error),
          });
        }
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
          const products = await store.listProducts();
          return sendJson(res, 200, products.map((product) => ({
            ...product,
            internalDriveUrl: driveViewer.linkForDriveUrl(product.googleDriveUrl),
          })));
        }

        let match = url.pathname.match(/^\/api\/products\/([^/]+)$/);
        if (match && method === 'GET') {
          const product = await store.getProduct(match[1]!);
          return sendJson(res, 200, {
            ...product,
            internalDriveUrl: driveViewer.linkForDriveUrl(product.googleDriveUrl),
          });
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

        if (method === 'GET' && url.pathname === '/api/automation/report-intake') {
          return sendJson(res, 200, await driveReports.ensureIntakeDocument());
        }

        match = url.pathname.match(/^\/api\/automation\/reports\/([^/]+)\/status$/);
        if (match && method === 'GET') {
          return sendJson(res, 200, await pipeline.status(match[1]!));
        }

        if ((method === 'POST' || method === 'GET') && url.pathname === '/api/automation/import-drive-reports') {
          return sendJson(res, 200, await driveReports.importPendingChanges());
        }

        if (method === 'POST' && url.pathname === '/api/automation/process-next-stage') {
          let driveImport: unknown;
          try {
            driveImport = await driveReports.importPendingChanges();
          } catch (error) {
            driveImport = { ok: false, message: error instanceof Error ? error.message : String(error) };
            console.warn('Drive report import deferred', error);
          }
          const result = await pipeline.processNextStage(oidcToken);
          return sendJson(res, 200, { ...result, driveImport });
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
