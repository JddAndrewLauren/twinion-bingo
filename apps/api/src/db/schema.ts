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
  uniqueIndex,
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
]);

/** The win ladder of D5: one line, then two lines, then a full house. */
export const prizeKind = bingo.enum('prize_kind', [
  'LINE',
  'TWO_LINES',
  'FULL_HOUSE',
]);

/** A room is the persistent group: code, theme and roster. It outlives games (D13). */
export const rooms = bingo.table('rooms', {
  code: varchar('code', { length: ROOM_CODE_LENGTH }).primaryKey(),
  themeId: text('theme_id').notNull(),
  // Null until the host player exists: the host references the room, so one of
  // the two directions has to be filled in second.
  hostPlayerId: uuid('host_player_id').references(
    (): AnyPgColumn => players.id,
  ),
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

/** A game is one session within a room: its deck, cards, log and winners (D13). */
export const games = bingo.table('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomCode: varchar('room_code', { length: ROOM_CODE_LENGTH })
    .notNull()
    .references(() => rooms.code),
  themeId: text('theme_id').notNull(),
  /** The ~40-square room deck cards are dealt from (D6). */
  deck: text('deck').array().notNull(),
  seed: text('seed').notNull(),
  state: gameState('state').notNull().default('lobby'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

/**
 * A card is a fixed list of square IDs and nothing else. Marks are derived from
 * the call log, never stored — that is the one idea the whole design follows
 * from, so this table must never grow a mark column.
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
  },
  (table) => [primaryKey({ columns: [table.gameId, table.playerId] })],
);

/**
 * The append-only log, room-scoped rather than game-scoped so a single `seq`
 * orders roster changes and game events alike. `seq` is the SSE event id, which
 * makes Last-Event-ID replay one indexed query.
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
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    kind: roomEventKind('kind').notNull(),
    squareId: text('square_id'),
    /** The CALL row a RETRACT supersedes. */
    targetSeq: bigint('target_seq', { mode: 'bigint' }),
    prizeKind: prizeKind('prize_kind'),
  },
  (table) => [
    /**
     * Two players spotting the same event at the same moment race to insert the
     * same CALL. The partial unique index makes the loser a constraint
     * violation rather than a duplicate row, so the first writer wins.
     */
    uniqueIndex('room_events_call_unique')
      .on(table.gameId, table.squareId)
      .where(sql`kind = 'CALL'`),
    /**
     * Every SSE resume is `WHERE room_code = ? AND seq > ?` in `seq` order. The
     * primary key alone would make that a scan over every room's tail, so the
     * one query the realtime spine runs on a loop gets its own index.
     */
    index('room_events_room_code_seq_idx').on(table.roomCode, table.seq),
  ],
);
