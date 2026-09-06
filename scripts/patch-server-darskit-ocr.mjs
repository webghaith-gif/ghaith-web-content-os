import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/server.ts';
let source = await readFile(path, 'utf8');

const importLine = "import { handleDarsKitOcr } from './darskit-ocr';\n";
if (!source.includes(importLine.trim())) {
  const anchor = "import { safeStartupDiagnostic } from './utils/startup-diagnostic';\n";
  if (!source.includes(anchor)) throw new Error('DarsKit OCR import anchor not found');
  source = source.replace(anchor, anchor + importLine);
}

const route = `\n      if (url.pathname === '/api/darskit-ocr' && (method === 'POST' || method === 'OPTIONS' || method === 'GET')) {\n        return await handleDarsKitOcr(req, res);\n      }\n`;
if (!source.includes("url.pathname === '/api/darskit-ocr'")) {
  const anchor = "      const oidcToken = header(req, 'x-vercel-oidc-token');\n";
  if (!source.includes(anchor)) throw new Error('DarsKit OCR route anchor not found');
  source = source.replace(anchor, anchor + route);
}

await writeFile(path, source, 'utf8');
console.log('DarsKit OCR route wired into src/server.ts for this build.');
