import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

for (const target of ['dist/src/web', 'public']) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp('src/web', target, { recursive: true });
}

const baseIndex = await readFile('src/web/index.html', 'utf8');
const canonicalScope = '/app-standalone.html';
const scopeGuard = `<script>\n(() => {\n  if (!('serviceWorker' in navigator)) return;\n  const canonicalScope = '${canonicalScope}';\n  const cleanup = async () => {\n    try {\n      const registrations = await navigator.serviceWorker.getRegistrations();\n      await Promise.all(registrations.filter((registration) => {\n        try { return new URL(registration.scope).pathname !== canonicalScope; } catch { return true; }\n      }).map((registration) => registration.unregister()));\n    } catch {}\n  };\n  cleanup();\n  const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);\n  navigator.serviceWorker.register = (url, options = {}) => originalRegister(url, { ...options, scope: canonicalScope });\n})();\n</script>\n`;
const browserGuard = `<script>\n(() => {\n  if (!('serviceWorker' in navigator)) return;\n  const canonicalScope = '${canonicalScope}';\n  const cleanup = async () => {\n    try {\n      const registrations = await navigator.serviceWorker.getRegistrations();\n      await Promise.all(registrations.filter((registration) => {\n        try { return new URL(registration.scope).pathname !== canonicalScope; } catch { return true; }\n      }).map((registration) => registration.unregister()));\n    } catch {}\n  };\n  cleanup();\n  window.addEventListener('load', () => setTimeout(cleanup, 1200));\n  const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);\n  navigator.serviceWorker.register = (url, options = {}) => originalRegister(url, { ...options, scope: canonicalScope });\n})();\n</script>\n`;
const injectBeforeApp = (html, script) => html.replace('<script src="/app.js', `${script}<script src="/app.js`);
const appIndex = injectBeforeApp(baseIndex, scopeGuard);
const browserIndex = injectBeforeApp(
  baseIndex.replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest" \/>\s*/u, '\n'),
  browserGuard,
);

await writeFile('public/index.html', appIndex);
await writeFile('dist/src/web/index.html', appIndex);
await writeFile('public/app-standalone.html', appIndex);
await writeFile('public/browser.html', browserIndex);

await mkdir('dist/src/assets', { recursive: true });
await cp('src/assets/DejaVuSans.ttf', 'dist/src/assets/DejaVuSans.ttf');
await cp('src/assets/DejaVuSans.ttf', 'public/DejaVuSans.ttf');
