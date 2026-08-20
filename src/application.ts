import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './core/errors';
import { env } from './config/env';
import { Store } from './repositories/store';
import { createDatabase } from './repositories/database-factory';
import { IntelligenceService } from './services/intelligence.service';
import { ContentGenerationService } from './services/content-generation.service';
import { ApprovalService } from './services/approval.service';
import { PublishingOrchestrator } from './services/publishing-orchestrator';
import { MetricsService } from './services/metrics.service';
import { AssetService } from './services/asset.service';
import { NotificationService, type AppNotification } from './services/notification.service';
import { ReportArchiveService } from './services/report-archive.service';
import { PlatformRegistry } from './platforms/registry';
import { OpenAIAdapter } from './integrations/openai.adapter';
import { ClickUpAdapter } from './integrations/clickup.adapter';
import { MakeAdapter } from './integrations/make.adapter';
import { GoogleDriveAdapter } from './integrations/google-drive.adapter';
import { SemrushAdapter } from './integrations/semrush.adapter';
import { CanvaAdapter } from './integrations/canva.adapter';
import { HeyGenAdapter } from './integrations/heygen.adapter';
import { RemotionAdapter } from './integrations/remotion.adapter';
import type { PublishResult } from './core/types';

export function createApp() {
  const store = new Store(createDatabase());
  const intelligence = new IntelligenceService(store);
  const generation = new ContentGenerationService(store);
  const approval = new ApprovalService(store);
  const publishing = new PublishingOrchestrator(store, approval);
  const metrics = new MetricsService(store);
  const assets = new AssetService(store);
  const notifications = new NotificationService(store);
  const reportArchive = new ReportArchiveService(store);
  const platforms = new PlatformRegistry();

  const integrations = {
    openai: new OpenAIAdapter(),
    clickup: new ClickUpAdapter(),
    make: new MakeAdapter(),
    googleDrive: new GoogleDriveAdapter(store),
    semrush: new SemrushAdapter(),
    canva: new CanvaAdapter(store),
    heygen: new HeyGenAdapter(),
    remotion: new RemotionAdapter(),
  };

  const safeNotify = async (notification: AppNotification) => {
    try { return await notifications.send(notification); }
    catch (error) { console.warn('Notification delivery failed', error); return undefined; }
  };

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const method = req.method ?? 'GET';
      const oidcToken = requestHeader(req, 'x-vercel-oidc-token');

      if (method === 'GET' && isStaticPath(url.pathname)) return sendStatic(res, url.pathname);
      if (url.pathname === '/api/health' && method === 'GET') {
        await store.healthCheck();
        return sendJson(res, 200, { ok: true, service: 'Ghaith Web Content OS', storage: env.STORAGE_DRIVER, platforms: platforms.list() });
      }
      if (url.pathname === '/api/system' && method === 'GET') {
        const driveStatus = await integrations.googleDrive.oauthStatus();
        return sendJson(res, 200, {
          service: 'Ghaith Web Content OS',
          publishMode: env.PUBLISH_MODE,
          storage: env.STORAGE_DRIVER,
          platforms: platforms.list(),
          clickupListId: env.CLICKUP_LIST_ID ?? null,
          integrations: {
            'Gemini Automation': integrations.openai.enabledFor(oidcToken),
            ClickUp: integrations.clickup.enabled,
            Make: integrations.make.enabled,
            'Google Drive': driveStatus.connected,
            Canva: integrations.canva.enabled,
            HeyGen: integrations.heygen.enabled,
            Remotion: integrations.remotion.enabled,
          },
        });
      }
      if (url.pathname === '/api/integrations' && method === 'GET') {
        const [canvaStatus, driveStatus, notificationStatus, driveWatch] = await Promise.all([
          integrations.canva.oauthStatus(),
          integrations.googleDrive.oauthStatus(),
          notifications.status(),
          integrations.googleDrive.watchStatus(),
        ]);
        return sendJson(res, 200, {
          OpenAI: {
            enabled: integrations.openai.enabledFor(oidcToken),
            model: integrations.openai.modelFor(oidcToken),
            mode: integrations.openai.modeFor(oidcToken),
          },
          ClickUp: { enabled: integrations.clickup.enabled, listId: env.CLICKUP_LIST_ID },
          Make: { enabled: env.PUBLISH_MODE === 'webhook' ? integrations.make.enabled : false, paused: env.PUBLISH_MODE === 'clickup_watch' },
          GoogleDrive: { ...driveStatus, watch: driveWatch },
          Notifications: notificationStatus,
          Semrush: integrations.semrush.configuration(),
          Canva: { enabled: integrations.canva.enabled, mode: integrations.canva.mode, ...canvaStatus },
          HeyGen: { enabled: integrations.heygen.enabled, mode: integrations.heygen.mode, route: 'Make/HeyGen connector webhook' },
          Remotion: integrations.remotion.configuration(),
        });
      }

      if (url.pathname === '/api/notifications/public-key' && method === 'GET') {
        return sendJson(res, 200, { publicKey: await notifications.publicKey() });
      }
      if (url.pathname === '/api/notifications/status' && method === 'GET') {
        return sendJson(res, 200, await notifications.status());
      }
      if (url.pathname === '/api/notifications/subscribe' && method === 'POST') {
        const subscription = await notifications.subscribe(await readJson(req));
        let driveWatch: unknown = null;
        try {
          driveWatch = await integrations.googleDrive.ensureChangesWatch(`${requestOrigin(req)}/api/webhooks/google-drive`);
        } catch (error) {
          console.warn('Drive watch activation after push subscription failed', error);
        }
        const delivery = await safeNotify({
          title: 'تم تفعيل إشعارات غيث ويب ✅',
          body: 'ستصلك إشعارات عند جاهزية المحتوى وعند وصول ملفات محتوى جديدة إلى Google Drive.',
          url: '/',
          tag: 'notifications-enabled',
        });
        return sendJson(res, 201, { ok: true, endpoint: subscription.endpoint, delivery, driveWatch });
      }
      if (url.pathname === '/api/notifications/test' && method === 'POST') {
        return sendJson(res, 200, await notifications.send({
          title: 'اختبار إشعارات غيث ويب 🔔',
          body: 'الإشعارات تعمل بنجاح على هذا الجهاز.',
          url: '/',
          tag: 'notification-test',
        }));
      }

      if (url.pathname === '/api/integrations/clickup/test' && method === 'GET') {
        const probe = await integrations.clickup.testConnection();
        return sendJson(res, probe.ok ? 200 : 503, probe);
      }
      if (url.pathname === '/api/integrations/openai/test' && method === 'GET') {
        const probe = await integrations.openai.testConnection(oidcToken);
        return sendJson(res, probe.ok ? 200 : 503, probe);
      }
      if (url.pathname === '/api/integrations/google-drive/status' && method === 'GET') {
        return sendJson(res, 200, await integrations.googleDrive.oauthStatus());
      }
      if (url.pathname === '/api/integrations/google-drive/connect' && method === 'GET') {
        const redirectUri = `${requestOrigin(req)}/api/integrations/google-drive/callback`;
        const authorizationUrl = await integrations.googleDrive.createAuthorizationUrl(redirectUri);
        res.writeHead(302, { Location: authorizationUrl, 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (url.pathname === '/api/integrations/google-drive/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const oauthError = url.searchParams.get('error');
        if (oauthError) {
          res.writeHead(302, { Location: `/?googleDrive=error&reason=${encodeURIComponent(oauthError)}`, 'Cache-Control': 'no-store' });
          return res.end();
        }
        if (!code || !state) {
          res.writeHead(302, { Location: '/api/integrations/google-drive/connect', 'Cache-Control': 'no-store' });
          return res.end();
        }
        await integrations.googleDrive.handleOAuthCallback(code, state);
        res.writeHead(302, { Location: '/?googleDrive=connected', 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (url.pathname === '/api/integrations/google-drive/test' && method === 'GET') {
        const probe = await integrations.googleDrive.testConnection();
        return sendJson(res, probe.ok ? 200 : 503, probe);
      }
      if (url.pathname === '/api/integrations/google-drive/watch/status' && method === 'GET') {
        return sendJson(res, 200, await integrations.googleDrive.watchStatus());
      }
      if (url.pathname === '/api/integrations/google-drive/watch/ensure' && method === 'POST') {
        return sendJson(res, 200, await integrations.googleDrive.ensureChangesWatch(`${requestOrigin(req)}/api/webhooks/google-drive`));
      }
      if (url.pathname === '/api/cron/drive-watch' && method === 'GET') {
        const watch = await integrations.googleDrive.ensureChangesWatch(`${requestOrigin(req)}/api/webhooks/google-drive`);
        return sendJson(res, 200, { ok: true, expiration: watch.expiration, channelId: watch.channelId });
      }
      if (url.pathname === '/api/webhooks/google-drive' && method === 'POST') {
        const resourceState = requestHeader(req, 'x-goog-resource-state');
        if (resourceState === 'sync') {
          res.writeHead(204, { 'Cache-Control': 'no-store' });
          return res.end();
        }
        const changedFiles = await integrations.googleDrive.consumeChanges(
          requestHeader(req, 'x-goog-channel-id'),
          requestHeader(req, 'x-goog-channel-token'),
        );
        const visible = changedFiles.slice(0, 5);
        for (const file of visible) {
          await safeNotify({
            title: 'ملف محتوى جديد في Google Drive 📁',
            body: file.name,
            url: file.webViewLink ?? '/',
            tag: `drive-file-${file.id}`,
          });
        }
        if (changedFiles.length > visible.length) {
          await safeNotify({
            title: 'ملفات محتوى جديدة في Google Drive 📁',
            body: `تمت إضافة ${changedFiles.length} ملفات جديدة إلى مجلدات غيث ويب.`,
            url: '/',
            tag: 'drive-files-summary',
          });
        }
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (url.pathname === '/api/integrations/semrush/test' && method === 'GET') {
        const probe = integrations.semrush.configuration();
        return sendJson(res, probe.ok ? 200 : 503, { ...probe, note: 'Configuration check only; no Semrush API units are consumed.' });
      }
      if (url.pathname === '/api/integrations/canva/status' && method === 'GET') {
        return sendJson(res, 200, await integrations.canva.oauthStatus());
      }
      if (url.pathname === '/api/integrations/canva/connect' && method === 'GET') {
        const redirectUri = `${requestOrigin(req)}/api/integrations/canva/callback`;
        const authorizationUrl = await integrations.canva.createAuthorizationUrl(redirectUri);
        res.writeHead(302, { Location: authorizationUrl, 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (url.pathname === '/api/integrations/canva/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) {
          res.writeHead(302, { Location: '/api/integrations/canva/connect', 'Cache-Control': 'no-store' });
          return res.end();
        }
        await integrations.canva.handleOAuthCallback(code, state);
        res.writeHead(302, { Location: '/?canva=connected', 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (url.pathname === '/api/integrations/canva/test' && method === 'GET') {
        const probe = await integrations.canva.testConnection();
        return sendJson(res, probe.ok ? 200 : 503, probe);
      }
      if (url.pathname === '/api/integrations/heygen/test' && method === 'GET') {
        const probe = await integrations.heygen.testConnection();
        return sendJson(res, probe.ok ? 200 : 503, probe);
      }
      if (url.pathname === '/api/webhooks/heygen' && method === 'POST') {
        if (!env.HEYGEN_CALLBACK_SECRET) throw new AppError('HeyGen callback is not configured.', 503, 'INTEGRATION_DISABLED');
        if (requestHeader(req, 'x-ghaith-webhook-secret') !== env.HEYGEN_CALLBACK_SECRET) {
          throw new AppError('Invalid HeyGen callback secret.', 401, 'UNAUTHORIZED');
        }
        const body = await readJson(req);
        requireString(body.contentId, 'contentId');
        requireString(body.videoUrl, 'videoUrl');
        const content = await assets.ingestHeyGenVideo({
          contentId: body.contentId,
          videoUrl: body.videoUrl,
          videoId: optionalString(body.videoId),
        });
        await safeNotify({
          title: 'فيديو HeyGen النهائي جاهز على Google Drive 🎬',
          body: content.title,
          url: '/?view=content',
          tag: `heygen-video-${content.id}`,
        });
        return sendJson(res, 200, { ok: true, content });
      }
      if (url.pathname === '/api/integrations/remotion/test' && method === 'GET') {
        const probe = await integrations.remotion.testConnection();
        return sendJson(res, probe.ok ? 200 : 503, probe);
      }

      if (url.pathname === '/api/reports' && method === 'GET') return sendJson(res, 200, await store.listReports());
      if (url.pathname === '/api/reports' && method === 'POST') {
        const body = await readJson(req);
        requireString(body.title, 'title'); requireString(body.body, 'body');
        let report = await store.createReport({ title: body.title, body: body.body, source: optionalString(body.source) });
        report = await reportArchive.archive(report.id);
        await safeNotify({
          title: 'تقرير جديد وصل إلى Ghaith Web Content OS 📥',
          body: report.title,
          url: '/?view=reports',
          tag: `report-${report.id}`,
        });
        return sendJson(res, 201, report);
      }
      if (url.pathname === '/api/reports/archive-pending' && method === 'POST') {
        const requested = Number(url.searchParams.get('limit') ?? 5);
        return sendJson(res, 200, await reportArchive.archivePending(Number.isFinite(requested) ? requested : 5));
      }
      if (url.pathname === '/api/opportunities' && method === 'GET') return sendJson(res, 200, await store.listOpportunities());
      if (url.pathname === '/api/content' && method === 'GET') return sendJson(res, 200, await store.listContents());
      if (url.pathname === '/api/logs' && method === 'GET') return sendJson(res, 200, await store.listLogs());
      if (url.pathname === '/api/metrics' && method === 'GET') return sendJson(res, 200, await metrics.get());
      if (url.pathname === '/api/platforms' && method === 'GET') return sendJson(res, 200, { platforms: platforms.list() });

      let match = url.pathname.match(/^\/api\/reports\/([^/]+)\/opportunities$/);
      if (match && method === 'POST') return sendJson(res, 201, await intelligence.extractOpportunities(match[1]!, oidcToken));

      match = url.pathname.match(/^\/api\/reports\/([^/]+)\/archive$/);
      if (match && method === 'POST') return sendJson(res, 200, await reportArchive.archive(match[1]!));

      match = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/content$/);
      if (match && method === 'POST') {
        const body = await readJson(req);
        if (!Array.isArray(body.platforms) || body.platforms.length === 0 || body.platforms.some((x: unknown) => typeof x !== 'string')) {
          throw new AppError('platforms must be a non-empty string array.', 400, 'VALIDATION_ERROR');
        }
        const content = await generation.createFromOpportunity(match[1]!, body.platforms as string[], oidcToken);
        await safeNotify({
          title: 'محتوى جديد جاهز للمراجعة ✨',
          body: content.title,
          url: '/?view=content',
          tag: `content-review-${content.id}`,
        });
        return sendJson(res, 201, content);
      }

      match = url.pathname.match(/^\/api\/content\/([^/]+)$/);
      if (match && method === 'GET') return sendJson(res, 200, await store.getContent(match[1]!));
      if (match && method === 'PATCH') {
        const current = await store.getContent(match[1]!);
        if (current.status === 'PUBLISHED' || current.status === 'ARCHIVED') throw new AppError('Published/archived content is read-only.', 409, 'LOCKED_CONTENT');
        const patch = editableContentPatch(await readJson(req));
        if (Object.keys(patch).length === 0) throw new AppError('No editable fields supplied.', 400, 'VALIDATION_ERROR');
        return sendJson(res, 200, await store.updateContent(match[1]!, { ...patch, revision: current.revision + 1 } as any));
      }

      match = url.pathname.match(/^\/api\/content\/([^/]+)\/(review|approve|assets|repair-assets|publish)$/);
      if (match && method === 'POST') {
        const id = match[1]!; const action = match[2]!;
        if (action === 'review') return sendJson(res, 200, await approval.submitForReview(id));
        if (action === 'approve') {
          const body = await readJson(req, true);
          const content = await approval.approve(id, optionalString(body.approvedBy) ?? 'user');
          await safeNotify({
            title: 'المحتوى READY وجاهز للنشر ✅',
            body: content.title,
            url: '/?view=content',
            tag: `content-ready-${content.id}`,
          });
          return sendJson(res, 200, content);
        }
        if (action === 'assets') {
          const before = await store.getContent(id);
          const content = await assets.requestAssets(id);
          const added = Math.max(0, (content.googleDriveUrls?.length ?? 0) - (before.googleDriveUrls?.length ?? 0));
          if (added > 0) {
            await safeNotify({
              title: 'أصول المحتوى جاهزة على Google Drive 🎨',
              body: `${content.title} — تمت إضافة ${added} ملفات/روابط جديدة.`,
              url: '/?view=content',
              tag: `content-assets-${content.id}`,
            });
          }
          return sendJson(res, 200, content);
        }
        if (action === 'repair-assets') {
          const result = await assets.repairFallbackAssets(id);
          if (result.repairedFiles.length > 0) {
            await safeNotify({
              title: result.complete ? 'تم إصلاح أصول المحتوى على Google Drive 🛠️' : 'إصلاح الأصول غير مكتمل على Google Drive ⚠️',
              body: result.complete
                ? `${result.content.title} — تم إنشاء ${result.repairedFiles.length} أصول فعلية بخط عربي مضمّن.`
                : `${result.content.title} — الأصول الناقصة: ${result.missingKinds.join(', ')}.`,
              url: '/?view=content',
              tag: `content-assets-repaired-${result.content.id}`,
            });
          }
          return sendJson(res, 200, result);
        }
        if (action === 'publish') return sendJson(res, 200, await publishing.publish(id));
      }

      if (url.pathname === '/api/webhooks/make' && method === 'POST') {
        if (env.MAKE_WEBHOOK_SECRET && req.headers['x-ghaith-webhook-secret'] !== env.MAKE_WEBHOOK_SECRET) {
          throw new AppError('Invalid webhook secret.', 401, 'UNAUTHORIZED');
        }
        const body = await readJson(req);
        requireString(body.contentId, 'contentId'); requireString(body.platform, 'platform'); requireString(body.result, 'result');
        if (!['SUCCESS', 'WARNING', 'ERROR'].includes(body.result)) throw new AppError('result must be SUCCESS, WARNING, or ERROR.', 400, 'VALIDATION_ERROR');
        return sendJson(res, 200, await publishing.recordMakeResult({
          contentId: body.contentId,
          platform: body.platform,
          result: body.result as PublishResult,
          publicUrl: optionalString(body.publicUrl),
          executionId: optionalString(body.executionId),
          attempt: typeof body.attempt === 'number' ? body.attempt : undefined,
          errorCode: optionalString(body.errorCode),
          errorMessage: optionalString(body.errorMessage),
        }));
      }

      return sendJson(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      handleError(res, error);
    }
  });
}

const staticFiles: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/notifications.js': { file: 'notifications.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/manifest.webmanifest': { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8' },
  '/sw.js': { file: 'sw.js', type: 'text/javascript; charset=utf-8' },
  '/icon.svg': { file: 'icon.svg', type: 'image/svg+xml; charset=utf-8' },
};

function isStaticPath(pathname: string) { return Object.prototype.hasOwnProperty.call(staticFiles, pathname); }
async function sendStatic(res: ServerResponse, pathname: string) {
  const item = staticFiles[pathname]!;
  const content = await readFile(path.join(__dirname, 'web', item.file));
  const mustRevalidate = ['/', '/sw.js', '/app.js', '/styles.css', '/linkify.js', '/notifications.js'].includes(pathname);
  res.writeHead(200, {
    'Content-Type': item.type,
    'Cache-Control': mustRevalidate ? 'no-cache, must-revalidate' : 'public, max-age=3600',
    ...(pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
  });
  res.end(content);
}

async function readJson(req: IncomingMessage, allowEmpty = false): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk); total += buf.length;
    if (total > 2_000_000) throw new AppError('Request body too large.', 413, 'PAYLOAD_TOO_LARGE');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw && allowEmpty) return {};
  if (!raw) throw new AppError('JSON body required.', 400, 'VALIDATION_ERROR');
  try { return JSON.parse(raw); } catch { throw new AppError('Invalid JSON.', 400, 'VALIDATION_ERROR'); }
}

function editableContentPatch(body: Record<string, any>) {
  const allowed = ['title', 'topic', 'targetAudience', 'objective', 'platforms', 'contentType', 'package', 'assets', 'googleDriveUrls', 'clickupTaskId'];
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
}

function requestOrigin(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-proto'];
  const protocol = typeof forwarded === 'string' ? forwarded.split(',')[0]!.trim() : 'http';
  return `${protocol}://${req.headers.host ?? 'localhost'}`;
}
function requestHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return undefined;
}
function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(`${field} is required.`, 400, 'VALIDATION_ERROR');
}
function optionalString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function sendJson(res: ServerResponse, status: number, data: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function handleError(res: ServerResponse, error: unknown) {
  if (error instanceof AppError) return sendJson(res, error.statusCode, { error: error.code, message: error.message });
  console.error(error); return sendJson(res, 500, { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
}
