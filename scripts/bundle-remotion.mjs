import path from 'node:path';
import { rm } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';

const outDir = path.resolve('dist/remotion-bundle');
await rm(outDir, { recursive: true, force: true });
await bundle({
  entryPoint: path.resolve('src/remotion/index.tsx'),
  outDir,
  publicDir: path.resolve('src/assets'),
  enableCaching: true,
  onProgress: () => undefined,
});
