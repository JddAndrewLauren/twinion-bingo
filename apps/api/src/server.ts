import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { resolveServerConfig } from './config.js';

const { port, allowedOrigins } = resolveServerConfig(process.env);

serve({ fetch: createApp({ allowedOrigins }).fetch, port, hostname: '::' });

console.log(
  `api listening on :${port}, web origins ${allowedOrigins.join(', ')}`,
);
