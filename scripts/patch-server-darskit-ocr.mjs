import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/server.ts';
let source = await readFile(path, 'utf8');

const oldImport = "import { handleDarsKitOcr } from './darskit-ocr';\n";
const importLine = "import { handleDarsKitGenerate, handleDarsKitOcr } from './darskit-ocr';\n";
if (source.includes(oldImport)) {
  source = source.replace(oldImport, importLine);
} else if (!source.includes(importLine.trim())) {
  const anchor = "import { safeStartupDiagnostic } from './utils/startup-diagnostic';\n";
  if (!source.includes(anchor)) throw new Error('DarsKit import anchor not found');
  source = source.replace(anchor, anchor + importLine);
}

const ocrRoute = `\n      if (url.pathname === '/api/darskit-ocr' && (method === 'POST' || method === 'OPTIONS' || method === 'GET')) {\n        return await handleDarsKitOcr(req, res);\n      }\n`;
if (!source.includes("url.pathname === '/api/darskit-ocr'")) {
  const anchor = "      const oidcToken = header(req, 'x-vercel-oidc-token');\n";
  if (!source.includes(anchor)) throw new Error('DarsKit route anchor not found');
  source = source.replace(anchor, anchor + ocrRoute);
}

const generateRoute = `\n      if (url.pathname === '/api/darskit-generate' && (method === 'POST' || method === 'OPTIONS' || method === 'GET')) {\n        return await handleDarsKitGenerate(req, res);\n      }\n`;
if (!source.includes("url.pathname === '/api/darskit-generate'")) {
  const anchor = "      const oidcToken = header(req, 'x-vercel-oidc-token');\n";
  if (!source.includes(anchor)) throw new Error('DarsKit generate route anchor not found');
  source = source.replace(anchor, anchor + generateRoute);
}

await writeFile(path, source, 'utf8');
console.log('DarsKit media + grounded generation routes wired into src/server.ts for this build.');
