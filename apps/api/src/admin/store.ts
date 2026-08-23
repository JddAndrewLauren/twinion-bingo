import { count, desc } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { games, players, rooms } from '../db/schema.js';

/**
 * A room hosts one game, ever (ADR-0010), and that game row does not exist
 * until the host starts it — so a room sitting in its lobby has no `games` row
 * to read a state off. `lobby` is the state that room is in, not a fourth value
 * `gameState` (`bingo.game_state`) offers.
 */
export type OpenRoom = {
  code: string;
  themeId: string;
  playerCount: number;
  gameState: 'lobby' | 'live' | 'done';
  ageSeconds: number;
};

/**
 * Every room, newest first — the ones an operator at the track cares about are
 * whichever just started. Three queries rather than one join: a room's player
 * count and game state are each at most one row per room, and joining both
 * onto `rooms` would multiply player rows by however many (zero or one) game
 * rows a room has, which a `COUNT(players.id)` would then have to divide back
 * out. Kept apart, each query is exactly what its name says.
 */
export async function listOpenRooms(
  db: Db,
  now: Date,
): Promise<OpenRoom[]> {
  const roomRows = await db
    .select({ code: rooms.code, themeId: rooms.themeId, createdAt: rooms.createdAt })
    .from(rooms)
    .orderBy(desc(rooms.createdAt));

  if (roomRows.length === 0) return [];

  const playerCounts = await db
    .select({ roomCode: players.roomCode, count: count() })
    .from(players)
    .groupBy(players.roomCode);
  const playerCountByRoom = new Map(
    playerCounts.map((row) => [row.roomCode, row.count]),
  );

  const gameStates = await db
    .select({ roomCode: games.roomCode, state: games.state })
    .from(games);
  const stateByRoom = new Map(gameStates.map((row) => [row.roomCode, row.state]));

  return roomRows.map((room) => ({
    code: room.code,
    themeId: room.themeId,
    playerCount: playerCountByRoom.get(room.code) ?? 0,
    gameState: stateByRoom.get(room.code) ?? 'lobby',
    ageSeconds: Math.max(
      0,
      Math.floor((now.getTime() - room.createdAt.getTime()) / 1000),
    ),
  }));
}
