import { cp, mkdir, rm } from 'node:fs/promises';

for (const target of ['dist/src/web', 'public']) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp('src/web', target, { recursive: true });
}

await mkdir('dist/src/assets', { recursive: true });
await cp('src/assets/DejaVuSans.ttf', 'dist/src/assets/DejaVuSans.ttf');
await cp('src/assets/DejaVuSans.ttf', 'public/DejaVuSans.ttf');
