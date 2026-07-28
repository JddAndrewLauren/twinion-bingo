import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isOriginAllowed, type AppConfig } from './config.js';
import { createRoomRoutes } from './rooms/routes.js';

export type { AppConfig };

export function createApp(config: AppConfig) {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) =>
        isOriginAllowed(origin, config.allowedOrigins) ? origin : null,
    }),
  );

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/', createRoomRoutes(config.db));

  return app;
}
