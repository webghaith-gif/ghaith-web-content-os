import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');

const rawPort = process.env.PORT?.trim();
const parsedPort = rawPort ? Number(rawPort) : 3000;
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

createApp().listen(port);
