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
  CardMarked,
  CardNotFound,
  CallNotFound,
  GameAlreadyStarted,
  GameNotLive,
  NoDifferentCard,
  NotHost,
  NotInDeck,
  NotOnYourCard,
  NotYourCall,
  readGame,
  rerollCard,
  retractCall,
  roomCodeForGame,
  startGame,
  triggerLightsOut,
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
      if (error instanceof GameAlreadyStarted) {
        return c.json({ error: 'this room has already started its game' }, 409);
      }
      /**
       * The theme's pool cannot supply a deck to D6's composition. That is a
       * content shortfall in the repo, not something this request did wrong and
       * not something a retry fixes — no committed pool is that thin today, so
       * reaching here means a new or edited theme has not been authored up to
       * the quotas. The composer's arithmetic goes back in the body rather than
       * only to the logs, because the operator reading it is the person who can
       * fix it.
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

  routes.post('/games/:id/card/reroll', async (c) => {
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

    try {
      return c.json(await rerollCard(db, pools, id, you.id));
    } catch (error) {
      if (error instanceof CardNotFound) {
        return c.json({ error: 'you have no card in this game' }, 404);
      }
      if (error instanceof CardMarked) {
        return c.json({ error: 'your card has a live mark' }, 409);
      }
      if (error instanceof NoDifferentCard) {
        return c.json({ error: 'no different card could be dealt' }, 409);
      }
      if (error instanceof GameNotLive) {
        return c.json({ error: 'this game has finished' }, 409);
      }
      throw error;
    }
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
      if (error instanceof NotInDeck) {
        return c.json({ error: "that square is not in this game's deck" }, 403);
      }
      /**
       * The full house closed the session (D5). 409 rather than 403: nothing is
       * wrong with who is asking or what they tapped, the game is simply over.
       */
      if (error instanceof GameNotLive) {
        return c.json({ error: 'this game has finished' }, 409);
      }
      throw error;
    }
  });

  /**
   * `LIGHTS_OUT` (#124): the theme's free centre, tapped as a room-wide event
   * rather than a call. Anyone in the room may tap it, and first tap wins — a
   * later tap is handed the row that already landed rather than an error, the
   * same shape as a tied call. It earns no mark and settles no rung, so nothing
   * here needs card scope or deck scope the way `/call` does.
   */
  routes.post('/games/:id/lights-out', async (c) => {
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

    try {
      const result = await triggerLightsOut(db, id, you.id);

      // 200 rather than 201 when someone else's tap already landed: the room is
      // lit, which is what this tap was asking for.
      return c.json(result, result.appended ? 201 : 200);
    } catch (error) {
      if (error instanceof GameNotLive) {
        return c.json({ error: 'this game has finished' }, 409);
      }
      throw error;
    }
  });

  /**
   * D8's correction. The call named by `seq` is superseded by an appended RETRACT
   * row and is never deleted — deleting it would break `Last-Event-ID` replay for
   * every device that had already seen it, and the whole design rests on a device
   * replaying the log arriving where a device that watched it live already is.
   *
   * Which of D8's three interactions got here — the ten-second undo toast, the
   * confirmation dialog after it, or the host's unrestricted retract — is not
   * something this route can see or needs to. Friction is the client's job; the
   * rule is that a player may take back their own call and the host may take back
   * anyone's.
   */
  routes.post('/games/:id/retract', async (c) => {
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

    const seq = readSeq(await readJson(c.req.raw));
    if (seq === undefined) {
      return c.json({ error: 'seq is required' }, 400);
    }

    try {
      const retraction = await retractCall(db, id, you.id, seq);

      // 200 rather than 201 when the call was already retracted, for the same
      // reason a losing call gets one: nothing was created, and nothing went
      // wrong either — the square is unmarked, which is what was asked for.
      return c.json(retraction, retraction.appended ? 201 : 200);
    } catch (error) {
      if (error instanceof CallNotFound) {
        return c.json({ error: 'no call in this game has that seq' }, 404);
      }
      if (error instanceof NotYourCall) {
        return c.json(
          { error: 'only the caller or the host can retract that call' },
          403,
        );
      }
      /**
       * The full house closed the session (D5). 409 rather than 403: nothing is
       * wrong with who is asking or what they tapped, the game is simply over.
       */
      if (error instanceof GameNotLive) {
        return c.json({ error: 'this game has finished' }, 409);
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

/** `seq` is a bigserial, so anything but a positive whole number is a bad body. */
function readSeq(body: Record<string, unknown>): number | undefined {
  const seq = body.seq;

  return typeof seq === 'number' && Number.isSafeInteger(seq) && seq > 0
    ? seq
    : undefined;
}
