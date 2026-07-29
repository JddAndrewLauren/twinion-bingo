import type { Pool } from '@twinion-bingo/theme';
import { Hono } from 'hono';
import { bearerToken } from '../bearer.js';
import type { Db } from '../db/client.js';
import { normalizeRoomCode } from '../rooms/codes.js';
import { findPlayerByToken, RoomNotFound } from '../rooms/store.js';
import { DeckCompositionError } from './deck.js';
import { GameAlreadyLive, NotHost, readGame, startGame } from './store.js';

export function createGameRoutes(db: Db, pools: Map<string, Pool>) {
  const routes = new Hono();

  /**
   * The host starts the game. Nothing is returned to the other players here —
   * they learn about it from the `GAME_STARTED` row on the stream they are
   * already holding, and read their own card back through the route below.
   */
  routes.post('/rooms/:code/games', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    const token = bearerToken(c.req.header('authorization'));
    const you =
      token === undefined ? undefined : await findPlayerByToken(db, code, token);

    if (you === undefined) {
      return c.json({ error: 'a player token is required' }, 401);
    }

    try {
      return c.json(await startGame(db, pools, code, you.id), 201);
    } catch (error) {
      if (error instanceof RoomNotFound) {
        return c.json({ error: 'no room with that code' }, 404);
      }
      if (error instanceof NotHost) {
        return c.json({ error: 'only the host can start a game' }, 403);
      }
      if (error instanceof GameAlreadyLive) {
        return c.json({ error: 'this room already has a live game' }, 409);
      }
      /**
       * The theme's pool cannot supply a deck to D6's composition. That is a
       * content shortfall in the repo, not something this request did wrong and
       * not something a retry fixes — the F1 pool is a 47-square starter until
       * #16 authors it to ~180. The composer's arithmetic goes back in the body
       * rather than only to the logs, because the operator reading it is the
       * person who can fix it.
       */
      if (error instanceof DeckCompositionError) {
        return c.json({ error: error.message }, 503);
      }
      throw error;
    }
  });

  /** The room's current game, and the reader's own card if they hold one. */
  routes.get('/rooms/:code/game', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    const token = bearerToken(c.req.header('authorization'));
    const you =
      token === undefined ? undefined : await findPlayerByToken(db, code, token);

    const game = await readGame(db, pools, code, you?.id);

    return game === undefined
      ? c.json({ error: 'this room has no game yet' }, 404)
      : c.json(game);
  });

  return routes;
}
