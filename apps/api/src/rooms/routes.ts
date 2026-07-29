import { Hono } from 'hono';
import { bearerToken } from '../bearer.js';
import type { Db } from '../db/client.js';
import { normalizeRoomCode } from './codes.js';
import {
  createRoom,
  findPlayerByToken,
  joinRoom,
  normalizeName,
  readRoster,
  RoomNotFound,
} from './store.js';

export function createRoomRoutes(db: Db) {
  const routes = new Hono();

  routes.post('/rooms', async (c) => {
    const name = normalizeName((await readJson(c.req.raw)).name);
    if (name === undefined) return c.json({ error: 'name is required' }, 400);

    return c.json(await createRoom(db, name), 201);
  });

  routes.post('/rooms/:code/join', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    const name = normalizeName((await readJson(c.req.raw)).name);
    if (name === undefined) return c.json({ error: 'name is required' }, 400);

    try {
      return c.json(await joinRoom(db, code, name), 201);
    } catch (error) {
      if (error instanceof RoomNotFound) {
        return c.json({ error: 'no room with that code' }, 404);
      }
      throw error;
    }
  });

  /**
   * The roster read. A player identifies itself with the token it was issued at
   * join, which is how a reload comes back as the same player rather than a new
   * one; without a recognised token `you` is null and the web app asks for a name.
   */
  routes.get('/rooms/:code', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    const roster = await readRoster(db, code);
    if (roster === undefined) {
      return c.json({ error: 'no room with that code' }, 404);
    }

    const token = bearerToken(c.req.header('authorization'));
    const you =
      token === undefined
        ? undefined
        : await findPlayerByToken(db, code, token);

    return c.json({ ...roster, you: you ?? null });
  });

  return routes;
}

/** A body that is absent or not JSON is a missing name, not a crash. */
async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
