import { Hono } from 'hono';
import { bearerToken } from '../bearer.js';
import type { Db } from '../db/client.js';
import { normalizeRoomCode } from '../rooms/codes.js';
import { RoomNotFound } from '../rooms/store.js';
import {
  deleteRoom,
  forceEndGame,
  GameToEndNotFound,
  kickPlayer,
  listOpenRooms,
  PlayerNotFound,
} from './store.js';

/** Player ids are `uuid` columns; anything else is a bad URL, not a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/admin/*`, gated by the one shared secret (#125) and, from #126, the three
 * mutating actions an operator has at the track: force-end a stale game,
 * delete an abandoned room, kick a player. Sent the same way a player's token
 * is — `Authorization: Bearer <secret>` — so `bearer.ts` is reused rather than
 * a second header parser invented for one route.
 *
 * A missing or wrong secret, and an unconfigured `adminSecret`, all answer the
 * same 401 with no body naming a reason: the acceptance criterion is that the
 * surface reveals nothing about whether any room exists without the secret, and
 * a response that distinguished "wrong secret" from "no rooms" would leak that.
 * One middleware in front of every `/admin/*` route, rather than the same
 * three-line check copied into each — the four routes below all need exactly
 * the same gate, and duplicating it is how it would eventually drift.
 */
export function createAdminRoutes(db: Db, adminSecret: string | undefined) {
  const routes = new Hono();

  routes.use('/admin/*', async (c, next) => {
    const provided = bearerToken(c.req.header('authorization'));
    if (adminSecret === undefined || provided !== adminSecret) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    await next();
  });

  routes.get('/admin/rooms', async (c) => {
    return c.json({ rooms: await listOpenRooms(db, new Date()) });
  });

  /**
   * Sets the room's game `done` and appends `GAME_FORCE_ENDED`, so every
   * connected device learns through the stream rather than discovering it on
   * the next read (#126). No prize is written — this is ADR-0003's one-way
   * `done` reached through its second door, not a claim that anyone won.
   */
  routes.post('/admin/rooms/:code/game/end', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    try {
      await forceEndGame(db, code);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof GameToEndNotFound) {
        return c.json({ error: 'this room has no game to end' }, 404);
      }
      throw error;
    }
  });

  /**
   * Hard-deletes a room and everything under it (#126) — chosen over archival
   * because a room an operator deletes is one nobody is coming back to replay.
   */
  routes.delete('/admin/rooms/:code', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    try {
      await deleteRoom(db, code);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof RoomNotFound) {
        return c.json({ error: 'no room with that code' }, 404);
      }
      throw error;
    }
  });

  /**
   * Revokes a player's token (#126). Their player row and their calls stay,
   * credited by name — only their access is withdrawn, never cascaded onto
   * marks or prizes derived from calls they made.
   */
  routes.post('/admin/rooms/:code/players/:playerId/kick', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    const playerId = c.req.param('playerId');
    if (!UUID.test(playerId)) {
      return c.json({ error: 'no player with that id' }, 404);
    }

    try {
      await kickPlayer(db, code, playerId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof PlayerNotFound) {
        return c.json({ error: 'no player with that id in this room' }, 404);
      }
      throw error;
    }
  });

  return routes;
}
