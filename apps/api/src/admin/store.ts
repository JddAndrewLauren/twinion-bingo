import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cards, games, players, roomEvents, rooms } from '../db/schema.js';
import { RoomNotFound } from '../rooms/store.js';

/** A room with no game, or no room at all — either way, nothing to end. */
export class GameToEndNotFound extends Error {
  constructor(code: string) {
    super(`room ${code} has no game to end`);
    this.name = 'GameToEndNotFound';
  }
}

export class PlayerNotFound extends Error {
  constructor(playerId: string) {
    super(`no player ${playerId} in this room`);
    this.name = 'PlayerNotFound';
  }
}

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
  /**
   * Named and identified (#126), not just counted: the admin's kick action
   * needs a player id to name, and the operator reading the list needs the
   * name it kicks to be legible rather than a UUID.
   */
  players: { id: string; name: string }[];
};

/**
 * Every room, newest first — the ones an operator at the track cares about are
 * whichever just started. Three queries rather than one join: a room's roster
 * and game state are each at most one row per room (roster row *per player*),
 * and joining either onto `rooms` would multiply room columns across however
 * many rows the other side has. Kept apart, each query is exactly what its
 * name says.
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

  const playerRows = await db
    .select({ roomCode: players.roomCode, id: players.id, name: players.name })
    .from(players)
    .orderBy(asc(players.joinSeq));
  const playersByRoom = new Map<string, { id: string; name: string }[]>();
  for (const row of playerRows) {
    const list = playersByRoom.get(row.roomCode) ?? [];
    list.push({ id: row.id, name: row.name });
    playersByRoom.set(row.roomCode, list);
  }

  const gameStates = await db
    .select({ roomCode: games.roomCode, state: games.state })
    .from(games);
  const stateByRoom = new Map(gameStates.map((row) => [row.roomCode, row.state]));

  return roomRows.map((room) => ({
    code: room.code,
    themeId: room.themeId,
    playerCount: playersByRoom.get(room.code)?.length ?? 0,
    players: playersByRoom.get(room.code) ?? [],
    gameState: stateByRoom.get(room.code) ?? 'lobby',
    ageSeconds: Math.max(
      0,
      Math.floor((now.getTime() - room.createdAt.getTime()) / 1000),
    ),
  }));
}

/**
 * The operator's second door on ADR-0003's one-way `done` (#126): a stale game
 * an operator ends by hand, rather than the win ladder's full house. Same
 * shape as the door already there — `state='done'` plus an appended event,
 * under the game row's own lock — so a call racing this is refused exactly as
 * it would race a full house (`assertLive`, `apps/api/src/games/store.ts`),
 * and every connected device learns from the stream rather than only on its
 * next read.
 *
 * `room_events.actor_player_id` stays `NOT NULL` (an admin is not a player,
 * and there is no per-room "system" player to point at), so this attributes
 * the row to the room's host — the one player guaranteed to exist by the time
 * a game does. Nothing reads `GAME_FORCE_ENDED` by its actor, so that
 * attribution is never surfaced as a claim that the host ended their own game.
 *
 * Idempotent: a game already `done` — whether by a prior force-end or by its
 * own full house — is left alone rather than erroring, the same tolerance
 * `retractCall` gives a second retraction of the same call.
 */
export async function forceEndGame(db: Db, code: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [game] = await tx
      .select({ id: games.id, state: games.state })
      .from(games)
      .where(eq(games.roomCode, code))
      .orderBy(desc(games.startedAt))
      .limit(1)
      .for('update');

    if (game === undefined) throw new GameToEndNotFound(code);
    if (game.state !== 'live') return;

    const [room] = await tx
      .select({ hostPlayerId: rooms.hostPlayerId })
      .from(rooms)
      .where(eq(rooms.code, code));

    if (room?.hostPlayerId == null) {
      throw new Error(`room ${code} has a live game but no host`);
    }

    await tx
      .update(games)
      .set({ state: 'done', endedAt: new Date() })
      .where(eq(games.id, game.id));

    await tx.insert(roomEvents).values({
      roomCode: code,
      gameId: game.id,
      actorPlayerId: room.hostPlayerId,
      kind: 'GAME_FORCE_ENDED',
    });
  });
}

/**
 * Hard-deletes a room and every row under it — its games, cards and events,
 * chosen deliberately over archival (#126): a room an operator deletes is one
 * nobody is coming back to replay.
 *
 * `rooms` and `players` reference each other (`rooms.host_player_id` ->
 * `players.id`, `players.room_code` -> `rooms.code`), so the cycle is broken
 * by clearing the host reference before players are deleted — the same
 * ordering problem `createRoom` solves the other direction by inserting the
 * room first and back-filling the host after.
 *
 * One transaction: a delete that stopped partway would leave a room with some
 * of its games gone and some of its events still pointing at a card that no
 * longer exists, which is worse than the room it replaced.
 */
export async function deleteRoom(db: Db, code: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [room] = await tx
      .select({ code: rooms.code })
      .from(rooms)
      .where(eq(rooms.code, code));

    if (room === undefined) throw new RoomNotFound(code);

    const roomGames = await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.roomCode, code));
    const gameIds = roomGames.map((row) => row.id);

    for (const gameId of gameIds) {
      await tx.delete(cards).where(eq(cards.gameId, gameId));
    }

    await tx.delete(roomEvents).where(eq(roomEvents.roomCode, code));
    await tx.delete(games).where(eq(games.roomCode, code));
    await tx.update(rooms).set({ hostPlayerId: null }).where(eq(rooms.code, code));
    await tx.delete(players).where(eq(players.roomCode, code));
    await tx.delete(rooms).where(eq(rooms.code, code));
  });
}

/**
 * Revokes a player's access without touching anything they have already done
 * (#126). Their player row and their `CALL` rows stay, credited by name, and
 * other players' marks and prizes are unaffected — deleting either would
 * silently un-mark squares on *other* players' cards on their next read
 * (`marks(player) = card.square_ids ∩ {live CALLs}`, `games/store.ts`), and
 * could retroactively un-earn an already-celebrated prize (#77's failure
 * mode).
 *
 * A fresh, never-issued token is written over the old one rather than
 * clearing it — the column is `NOT NULL UNIQUE`, and this device now holds a
 * token that matches no row, which is exactly what "revoked" needs to mean:
 * `findPlayerByToken` finds nobody, and every route that requires a player
 * refuses with the same 401 an absent token gets.
 */
export async function kickPlayer(
  db: Db,
  code: string,
  playerId: string,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');

  const updated = await db
    .update(players)
    .set({ token })
    .where(and(eq(players.roomCode, code), eq(players.id, playerId)))
    .returning({ id: players.id });

  if (updated.length === 0) throw new PlayerNotFound(playerId);
}
