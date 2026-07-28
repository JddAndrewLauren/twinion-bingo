import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

serve({ fetch: createApp({ webOrigin }).fetch, port, hostname: '::' });

console.log(`api listening on :${port}, web origin ${webOrigin}`);
