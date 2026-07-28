import { Hono } from 'hono';
import { cors } from 'hono/cors';

export type AppConfig = {
  /** Origin the web app is served from; the only origin allowed to call this API. */
  webOrigin: string;
};

export function createApp(config: AppConfig) {
  const app = new Hono();

  app.use('*', cors({ origin: config.webOrigin }));

  app.get('/health', (c) => c.json({ status: 'ok' }));

  return app;
}
