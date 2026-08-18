import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let requestHandler;

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

export default async function handler(req, res) {
  try {
    return await getRequestHandler()(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Ghaith Web Content OS request handler failed:', message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ ok: false, error: 'RUNTIME_HANDLER_ERROR', message }));
    }
  }
}
