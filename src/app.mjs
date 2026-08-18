import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');

const app = createApp();

export default app;
