import type { Pool } from '@twinion-bingo/theme';
import { Hono } from 'hono';
import { bearerToken } from '../bearer.js';
import type { Db } from '../db/client.js';
import { readJson } from '../json-body.js';
import { normalizeRoomCode } from '../rooms/codes.js';
import { findPlayerByToken, RoomNotFound } from '../rooms/store.js';
import { DeckCompositionError } from './deck.js';
import {
  callSquare,
  GameAlreadyLive,
  NotHost,
  NotOnYourCard,
  readGame,
  roomCodeForGame,
  startGame,
} from './store.js';

/**
 * Game ids are `uuid` columns, so anything else is a bad URL rather than a query.
 * Postgres rejects a malformed uuid as a 22P02 error, which would surface as a
 * 500 for what is only ever somebody typing in the address bar.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  /**
   * First to spot it calls it, and it marks for everyone holding it (D1). One row
   * is appended and nothing else is written — the marks every device shows are
   * derived from this row on their next read, and the stream is what tells them
   * to take one.
   *
   * The response is deliberately not the new state of anybody's card: the caller
   * learns what everyone else learns, through the stream, so there is one path
   * into a marked square rather than a fast one for the caller and a slow one for
   * the room.
   */
  routes.post('/games/:id/call', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json({ error: 'no game with that id' }, 404);

    const code = await roomCodeForGame(db, id);
    if (code === undefined) return c.json({ error: 'no game with that id' }, 404);

    const token = bearerToken(c.req.header('authorization'));
    const you =
      token === undefined ? undefined : await findPlayerByToken(db, code, token);

    if (you === undefined) {
      return c.json({ error: 'a player token is required' }, 401);
    }

    const squareId = readSquareId(await readJson(c.req.raw));
    if (squareId === undefined) {
      return c.json({ error: 'square_id is required' }, 400);
    }

    try {
      const call = await callSquare(db, id, you.id, squareId);

      // 200 rather than 201 when another device's identical call was already in
      // the log: the loser of a tied race did not create anything, and it is not
      // an error either — the square they spotted is called, which is what they
      // wanted.
      return c.json(call, call.appended ? 201 : 200);
    } catch (error) {
      if (error instanceof NotOnYourCard) {
        return c.json({ error: 'that square is not on your card' }, 403);
      }
      throw error;
    }
  });

  return routes;
}

function readSquareId(body: Record<string, unknown>): string | undefined {
  const squareId = body.square_id;

  return typeof squareId === 'string' && squareId !== '' ? squareId : undefined;
}
