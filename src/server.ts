import { createApp } from './app';
import { env } from './config/env';

createApp().listen(env.PORT, () => {
  console.log(`Ghaith Web Content OS running on http://localhost:${env.PORT}`);
});
