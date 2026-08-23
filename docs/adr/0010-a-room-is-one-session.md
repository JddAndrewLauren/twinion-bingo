# ADR-0010: A room is one session

- **Status:** accepted
- **Date:** 2026-08-22
- **Implemented by:** issue #117
- **Supersedes:** D13's "Room ≠ game... Same code for Saturday's sprint and Sunday's race, all
  season."

## Context

D13 drew two containers: a **room** that persists across a whole race weekend (code, theme,
roster) and a **game** that is one session inside it (deck, cards, log, winners). The same
four-character code was meant to serve Saturday's sprint and Sunday's race — a host starts a game,
it finishes, and the room sits ready for the next one with the roster already seated.

That model never earned its cost. Nothing in the shipped product re-joins a finished room for a
second session: `apps/web`'s only entry point is `createRoom`, there is no "start another game"
affordance in the host controls, and `readGame` already reads only the room's most recent game
(`ORDER BY startedAt DESC LIMIT 1`) rather than offering a choice among several. A room that
outlives its game buys a second start for a roster that, in practice, has already scattered:
a race weekend's sprint and race audiences are not reliably the same phones in the same room, and
nothing about the code or the roster survives the hours between them in a way anyone has asked to
use. Carrying the capability costs a real design surface — a deck that has to belong to *something
that isn't the game it was drawn for*, and a lifecycle question ("can you start a second game once
one is done?") that has sat unanswered and unenforced since D13 was written.

## Decision

**A room is one session.** The deck — the ~40 squares composed from the pool for this game (D6) —
is the room's character, not the game's: `rooms.deck`, not `games.deck`. A room is created for one
sprint, one race, one session; a new session gets a new code and a fresh join, same as it always
has for a first-time player.

This is not a change to how cards are dealt. `dealCard` is still seeded by the game's seed and the
player's id, so the 24-of-40 overlap still gives every player a different card every time — nothing
about "one session" changes what a card looks like or how a call marks it. It changes only where
the deck that seeds those cards is stored, and what a room is *for*.

### Alternatives considered and declined

- **"Clone this room."** A host action that starts a second game in the same room, carrying the
  code and roster forward and drawing a fresh deck. Declined: it reintroduces exactly the
  lifecycle question this ADR retires (what happens to the first game's deck, cards, and log when
  a second one starts in the same room?) without a stated need for it — nobody has asked for a
  same-code second session, and the roster it would carry forward is not reliably still there
  anyway. If a real need for same-code continuity across sessions surfaces, it is its own decision,
  not a side effect of where the deck column lives.
- **localStorage name-prefill.** Remembering a player's display name in the browser so rejoining a
  room (or joining a new one) does not ask for it again. Declined for the same reason: it answers a
  problem — repeated typing across sessions — that "a room is one session" does not create any more
  of than D13 already had, and it is a client-side convenience orthogonal to where the deck lives.
  Worth revisiting on its own if repeated name entry becomes a real friction point, not folded into
  this change.

## Consequences

- `rooms.deck` is nullable: a room exists (and can be joined) before its host starts a game, so the
  column has no value to hold until `startGame` writes it in the same transaction that creates the
  game row. `games.deck` is gone — schema migration
  `apps/api/drizzle/0005_lyrical_queen_noir.sql` adds the column, backfills it from each room's
  most recently started game (there is at most one that matters, since `readGame` only ever reads
  the latest), and drops the old column from `games`.
- `startGame`, `readGame`, `rerollCard` and `deckSquares`'s call sites in
  `apps/api/src/games/store.ts`, and `dealLateJoinCard` in `apps/api/src/games/late-join.ts`, all
  read the deck off `rooms` now. None of them change *what* deck they read: a live game's deck is
  still exactly the one deck the room currently holds, because starting a second game while one is
  live was already refused before this ADR and remains so — and, since a room is one session,
  a *finished* game now refuses a second start too (`GameAlreadyStarted`, `startGame`), so the
  room's deck is written exactly once and the cards dealt from it always describe it.
- `apps/api/test/migration-safety.test.ts`'s drop allowlist is widened, narrowly, to admit a named
  column drop on a schema-qualified `bingo` table — the same precedent ADR-0004 set for a named
  index drop. Still refused: an unqualified name, a non-`bingo` schema, a whole table, a whole
  schema, a whole type, or more than one drop per statement.
- Room-code churn goes up roughly 3x — one room per session rather than one per season. Checked
  against `apps/api/src/rooms/codes.ts`: unchanged, no fix needed. The alphabet is 24 characters
  over 4 positions (`ROOM_CODE_ALPHABET`), ~331,776 codes, and `createRoom`'s existing
  `CODE_ATTEMPTS` retry-on-collision loop already treats a taken code as an ordinary, expected
  event rather than a failure — it was never sized against "one room per season", so tripling the
  rate the alphabet is drawn from does not change its correctness, only (imperceptibly, at a
  handful of concurrent rooms on a race weekend) the odds any one attempt collides.
- `PLAN.md`'s D13 is annotated as superseded by this ADR rather than rewritten, so the numbered
  decision log stays a record of what was decided when. `CONTEXT.md`'s **Room**, **Game** and
  **Deck** entries are rewritten to match; **Session** is added as a new term for what a room now
  is one of (quali / sprint / race), distinct from `CONTEXT.md`'s looser prior use of "session" as
  a synonym for "game".
