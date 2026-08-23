import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAdminRoutes } from './admin/routes.js';
import { isOriginAllowed, type AppConfig } from './config.js';
import { createGameRoutes } from './games/routes.js';
import { loadPoolRegistry } from './games/pools.js';
import { createRoomRoutes } from './rooms/routes.js';
import { createStreamRoutes } from './rooms/stream.js';

export type { AppConfig };

export function createApp(config: AppConfig) {
  const app = new Hono();
  // Committed files that cannot change under a running process, so once.
  const pools = config.pools ?? loadPoolRegistry();

  app.use(
    '*',
    cors({
      origin: (origin) =>
        isOriginAllowed(origin, config.allowedOrigins) ? origin : null,
    }),
  );

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/', createRoomRoutes(config.db, pools));
  app.route('/', createGameRoutes(config.db, pools));
  app.route('/', createStreamRoutes(config.db, config.streamTimings));
  app.route('/', createAdminRoutes(config.db, config.adminSecret));

  return app;
}
