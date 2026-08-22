import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

for (const target of ['dist/src/web', 'public']) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp('src/web', target, { recursive: true });
}

const baseIndex = await readFile('src/web/index.html', 'utf8');
const scopeGuard = `<script>\n(() => {\n  if (!('serviceWorker' in navigator)) return;\n  const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);\n  navigator.serviceWorker.register = (url, options = {}) => originalRegister(url, { ...options, scope: '/app/' });\n})();\n</script>\n`;
const browserGuard = `<script>\n(() => {\n  if (!('serviceWorker' in navigator)) return;\n  const cleanup = async () => {\n    try {\n      const registrations = await navigator.serviceWorker.getRegistrations();\n      await Promise.all(registrations.filter((registration) => {\n        try { return new URL(registration.scope).pathname === '/'; } catch { return false; }\n      }).map((registration) => registration.unregister()));\n    } catch {}\n  };\n  cleanup();\n  window.addEventListener('load', () => setTimeout(cleanup, 1200));\n  const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);\n  navigator.serviceWorker.register = (url, options = {}) => originalRegister(url, { ...options, scope: '/app/' });\n})();\n</script>\n`;
const injectBeforeApp = (html, script) => html.replace('<script src="/app.js', `${script}<script src="/app.js`);
const appIndex = injectBeforeApp(baseIndex, scopeGuard);
const browserIndex = injectBeforeApp(
  baseIndex.replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest" \/>\s*/u, '\n'),
  browserGuard,
);

await writeFile('public/index.html', appIndex);
await writeFile('dist/src/web/index.html', appIndex);
for (const target of ['public/app', 'public/browser']) await mkdir(target, { recursive: true });
await writeFile('public/app/index.html', appIndex);
await writeFile('public/browser/index.html', browserIndex);

await mkdir('dist/src/assets', { recursive: true });
await cp('src/assets/DejaVuSans.ttf', 'dist/src/assets/DejaVuSans.ttf');
await cp('src/assets/DejaVuSans.ttf', 'public/DejaVuSans.ttf');
