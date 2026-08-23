import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { resolveServerConfig } from './config.js';
import { createDb } from './db/client.js';

const { port, allowedOrigins, databaseUrl, adminSecret } = resolveServerConfig(
  process.env,
);

serve({
  fetch: createApp({ allowedOrigins, db: createDb(databaseUrl), adminSecret })
    .fetch,
  port,
  hostname: '::',
});

console.log(
  `api listening on :${port}, web origins ${allowedOrigins.join(', ')}`,
);
