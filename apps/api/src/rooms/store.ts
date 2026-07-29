import { randomBytes } from 'node:crypto';
import type { Pool } from '@twinion-bingo/theme';
import { and, asc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { players, roomEvents, rooms } from '../db/schema.js';
import { dealLateJoinCard } from '../games/late-join.js';
import { defaultThemeId } from '../games/pools.js';
import { generateRoomCode } from './codes.js';

/**
 * Themes are repo folders (D10), and a manifest is a committed file that cannot
 * change under a running process — so the default theme's id is derived once, at
 * boot, exactly like the pools it has to agree with.
 */
const DEFAULT_THEME_ID = defaultThemeId();

/** Enough attempts that exhausting them means something other than bad luck. */
const CODE_ATTEMPTS = 8;

const MAX_NAME_LENGTH = 24;

export type Player = { id: string; name: string; joinSeq: number };

export type Roster = {
  code: string;
  themeId: string;
  hostPlayerId: string | null;
  players: Player[];
};

export type JoinResult = { code: string; token: string; player: Player };

export class RoomNotFound extends Error {
  constructor(code: string) {
    super(`no room with code ${code}`);
  }
}

/**
 * Display names are shown to everyone in the room and nowhere else, so the only
 * rules are that there is one and that it fits a phone-width roster row.
 */
export function normalizeName(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;

  const name = input.trim();

  return name === '' || name.length > MAX_NAME_LENGTH ? undefined : name;
}

/**
 * A room and its host are inserted in one transaction because they reference
 * each other: `rooms.host_player_id` is nullable precisely so the room can go in
 * first, and it is only correct if the back-fill cannot be lost.
 */
export async function createRoom(db: Db, name: string): Promise<JoinResult> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();

    try {
      return await db.transaction(async (tx) => {
        await tx.insert(rooms).values({ code, themeId: DEFAULT_THEME_ID });

        const joined = await addPlayer(tx, code, name);

        await tx
          .update(rooms)
          .set({ hostPlayerId: joined.player.id })
          .where(eq(rooms.code, code));

        return joined;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new Error(
    `could not find a free room code in ${CODE_ATTEMPTS} attempts`,
  );
}

/**
 * Joining mid-game deals the newcomer in rather than parking them in a lobby the
 * room has already left, so the join and the deal are one transaction — see
 * `dealLateJoinCard`.
 */
export async function joinRoom(
  db: Db,
  pools: Map<string, Pool>,
  code: string,
  name: string,
): Promise<JoinResult> {
  return db.transaction(async (tx) => {
    const [room] = await tx
      .select({ code: rooms.code })
      .from(rooms)
      .where(eq(rooms.code, code));

    if (room === undefined) throw new RoomNotFound(code);

    const joined = await addPlayer(tx, code, name);

    await dealLateJoinCard(tx, pools, code, joined.player.id);

    return joined;
  });
}

export async function readRoster(
  db: Db,
  code: string,
): Promise<Roster | undefined> {
  const [room] = await db
    .select({
      code: rooms.code,
      themeId: rooms.themeId,
      hostPlayerId: rooms.hostPlayerId,
    })
    .from(rooms)
    .where(eq(rooms.code, code));

  if (room === undefined) return undefined;

  const roster = await db
    .select({ id: players.id, name: players.name, joinSeq: players.joinSeq })
    .from(players)
    .where(eq(players.roomCode, code))
    .orderBy(asc(players.joinSeq));

  return { ...room, players: roster };
}

/**
 * Tokens are scoped to a room, so a token from one room cannot name a player in
 * another even though tokens are globally unique.
 */
export async function findPlayerByToken(
  db: Db,
  code: string,
  token: string,
): Promise<Player | undefined> {
  const [player] = await db
    .select({ id: players.id, name: players.name, joinSeq: players.joinSeq })
    .from(players)
    .where(and(eq(players.roomCode, code), eq(players.token, token)));

  return player;
}

/**
 * `join_seq` is the sequence number of the player's own PLAYER_JOINED row, so
 * roster order and the log's order are the same order — which is what later
 * gates win claims. The row cannot carry the player id until the player exists,
 * and the player cannot carry the sequence until the row exists, so this is the
 * same insert-then-back-fill shape as the host, and needs the same transaction.
 */
async function addPlayer(
  tx: Tx,
  code: string,
  name: string,
): Promise<JoinResult> {
  const token = randomBytes(32).toString('base64url');

  const [inserted] = await tx
    .insert(players)
    .values({ roomCode: code, name, token, joinSeq: 0 })
    .returning({ id: players.id });

  if (inserted === undefined) throw new Error('inserting the player added no row');

  const [event] = await tx
    .insert(roomEvents)
    .values({ roomCode: code, actorPlayerId: inserted.id, kind: 'PLAYER_JOINED' })
    .returning({ seq: roomEvents.seq });

  if (event === undefined) throw new Error('appending PLAYER_JOINED added no row');

  const joinSeq = Number(event.seq);

  await tx
    .update(players)
    .set({ joinSeq })
    .where(eq(players.id, inserted.id));

  return { code, token, player: { id: inserted.id, name, joinSeq } };
}
