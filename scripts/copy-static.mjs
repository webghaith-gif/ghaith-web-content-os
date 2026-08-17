import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist/src/web', { recursive: true, force: true });
await mkdir('dist/src/web', { recursive: true });
await cp('src/web', 'dist/src/web', { recursive: true });
