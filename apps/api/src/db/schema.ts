import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  index,
  integer,
  primaryKey,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * Every table lives in `bingo`, never `public` — this database is shared with
 * the twinion project (D3). The schema object here is only half the guarantee;
 * `schemaFilter: ['bingo']` in drizzle.config.ts is what stops drizzle-kit from
 * seeing twinion's `public` tables as absent and generating drops for them.
 */
export const bingo = pgSchema('bingo');

/** Room codes are 4 characters from a 24-letter alphabet with O/0/I/1 removed. */
const ROOM_CODE_LENGTH = 4;

export const gameState = bingo.enum('game_state', ['lobby', 'live', 'done']);

export const roomEventKind = bingo.enum('room_event_kind', [
  'PLAYER_JOINED',
  'GAME_STARTED',
  'CALL',
  'RETRACT',
  'PRIZE',
  'CARD_REROLLED',
]);

/** The win ladder of D5: one line, then two lines, then a full house. */
export const prizeKind = bingo.enum('prize_kind', [
  'LINE',
  'TWO_LINES',
  'FULL_HOUSE',
]);

/**
 * A room is the persistent group: code, theme and roster (ADR-0010 supersedes
 * D13's "same code all season" — a room is one session now, and the deck is
 * its character).
 */
export const rooms = bingo.table('rooms', {
  code: varchar('code', { length: ROOM_CODE_LENGTH }).primaryKey(),
  themeId: text('theme_id').notNull(),
  // Null until the host player exists: the host references the room, so one of
  // the two directions has to be filled in second.
  hostPlayerId: uuid('host_player_id').references(
    (): AnyPgColumn => players.id,
  ),
  /**
   * The ~40-square deck cards are dealt from (D6), moved here from `games` by
   * ADR-0010: a room now hosts at most one session, so the deck belongs to the
   * room rather than to a game row it outlived under the old model. Null until
   * the host starts the game.
   */
  deck: text('deck').array(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Identity is a display name plus a server-issued token, per browser (D11). */
export const players = bingo.table('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomCode: varchar('room_code', { length: ROOM_CODE_LENGTH })
    .notNull()
    .references(() => rooms.code),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  joinSeq: integer('join_seq').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A game is the play a room hosts: its cards, log and winners (ADR-0010;
 * supersedes D13). Not "one session within a room" — `CONTEXT.md` reserves
 * *Session* for the broadcast window outside the app (quali, sprint, race),
 * and a room is one of those. The deck lives on `rooms` now, not here.
 */
export const games = bingo.table('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomCode: varchar('room_code', { length: ROOM_CODE_LENGTH })
    .notNull()
    .references(() => rooms.code),
  themeId: text('theme_id').notNull(),
  seed: text('seed').notNull(),
  state: gameState('state').notNull().default('lobby'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

/**
 * A card is a fixed list of square IDs plus claim-boundary metadata. Marks are
 * derived from the call log, never stored — that is the one idea the whole
 * design follows from, so this table must never grow a mark column.
 */
export const cards = bingo.table(
  'cards',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    /** 24 earnable squares; the centre is free (D4). */
    squareIds: text('square_ids').array().notNull(),
    /** The room-log sequence that reset this card's claim boundary, if any. */
    latestRerollSeq: bigint('latest_reroll_seq', { mode: 'bigint' }),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.playerId] })],
);

/**
 * The append-only log, room-scoped rather than game-scoped so a single `seq`
 * orders roster changes and game events alike. `seq` is the SSE event id, which
 * makes Last-Event-ID replay one indexed query.
 *
 * Nothing here constrains a square to one CALL. Two players spotting the same
 * event in the same tick are arbitrated by the lock `callSquare` already holds on
 * the game row (ADR-0004), because whether a square is callable turns on whether
 * a RETRACT supersedes its call — a property of a *second* row, which an index
 * can only ever be blind to. The partial unique index that used to sit here read
 * a retracted square as still called, making it a permanent dead end (#45).
 *
 * Two of the indexes below serve the query that replaced it. They are not
 * constraints and enforce nothing: uniqueness lives in the lock now, and these
 * only keep the read that decides it off a scan of the whole log.
 */
export const roomEvents = bingo.table(
  'room_events',
  {
    seq: bigserial('seq', { mode: 'bigint' }).primaryKey(),
    roomCode: varchar('room_code', { length: ROOM_CODE_LENGTH })
      .notNull()
      .references(() => rooms.code),
    gameId: uuid('game_id').references(() => games.id),
    actorPlayerId: uuid('actor_player_id')
      .notNull()
      .references(() => players.id),
    /**
     * `clock_timestamp()`, not `defaultNow()`: `now()` is the transaction's
     * start, so a row appended late in a long transaction would already have
     * spent part of the stream's settle window before it existed. The insert's
     * own clock is what makes that window mean the interval it names — see
     * `SETTLE_MS` in `rooms/events.ts`.
     */
    at: timestamp('at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    kind: roomEventKind('kind').notNull(),
    squareId: text('square_id'),
    /** The CALL row a RETRACT supersedes. */
    targetSeq: bigint('target_seq', { mode: 'bigint' }),
    prizeKind: prizeKind('prize_kind'),
  },
  (table) => [
    /**
     * Every SSE resume is `WHERE room_code = ? AND seq > ?` in `seq` order. The
     * primary key alone would make that a scan over every room's tail, so the
     * one query the realtime spine runs on a loop gets its own index.
     */
    index('room_events_room_code_seq_idx').on(table.roomCode, table.seq),
    /**
     * The call path's own lookup: "does this square have a live call" runs on
     * every call now rather than only on a lost race, and it runs while holding
     * the game row's lock, so leaving it to a sequential scan would make each
     * call's lock hold time grow with the whole log — which is never pruned.
     *
     * Deliberately not unique. That is the difference between this index and the
     * one #45 removed: the same columns, none of the enforcement.
     */
    index('room_events_call_idx')
      .on(table.gameId, table.squareId)
      .where(sql`kind = 'CALL'`),
    /**
     * The other half of that lookup, and of every marks derivation: the anti-join
     * that asks whether any RETRACT names a given CALL's `seq`.
     */
    index('room_events_target_seq_idx')
      .on(table.targetSeq)
      .where(sql`kind = 'RETRACT'`),
  ],
);
