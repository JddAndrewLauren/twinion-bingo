import { Hono } from 'hono';
import { bearerToken } from '../bearer.js';
import type { Db } from '../db/client.js';
import { listOpenRooms } from './store.js';

/**
 * `/admin/rooms`, gated by the one shared secret (#125). Sent the same way a
 * player's token is — `Authorization: Bearer <secret>` — so `bearer.ts` is
 * reused rather than a second header parser invented for one route.
 *
 * A missing or wrong secret, and an unconfigured `adminSecret`, all answer the
 * same 401 with no body naming a reason: the acceptance criterion is that the
 * surface reveals nothing about whether any room exists without the secret, and
 * a response that distinguished "wrong secret" from "no rooms" would leak that.
 */
export function createAdminRoutes(db: Db, adminSecret: string | undefined) {
  const routes = new Hono();

  routes.get('/admin/rooms', async (c) => {
    const provided = bearerToken(c.req.header('authorization'));
    if (adminSecret === undefined || provided !== adminSecret) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    return c.json({ rooms: await listOpenRooms(db, new Date()) });
  });

  return routes;
}
