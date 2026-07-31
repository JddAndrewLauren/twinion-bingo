# Context: TwinIon Bingo

The language this project speaks. `PLAN.md` holds the design and its numbered decisions (D1–D15);
this file holds the words, so that an issue, a test name and a type all reach for the same one.

Where a term traces to a decision, the decision is named. Where it has a home in the code, that is
named too — the definition in the code is the authority, and this file is the index to it.

## The two containers

**Room** — a persistent group: a four-character code, a theme, a roster. It outlives any one
session, which is D13's whole point: the same code serves Saturday's sprint and Sunday's race, all
season. `apps/api/src/rooms/`.

**Game** — one session inside a room: a deck, cards, a log, winners (D13). A room has at most one
game that is not finished. `apps/api/src/games/`.

**Game state** — `lobby`, `live`, `done` (`gameState` in `apps/api/src/db/schema.ts`). `live` is the
only state in which a square may be called; `done` is terminal and one-way (ADR-0003).

**Room event** — an appended row in `room_events`, the log both containers are read out of. Every
row carries a `seq`, monotonic within a room, which is also the SSE `Last-Event-ID`. Kinds:
`PLAYER_JOINED`, `GAME_STARTED`, `CALL`, `RETRACT`, `PRIZE`, `CARD_REROLLED`.

## Squares and where they come from

**Pool** — a theme's whole authored body of squares (F1's is 300 at `v2`), committed to the repo as
folders under `themes/` (D9, D10). Not a runtime concept: nothing reads a pool during a race except
the deck composer.

**Deck** — the ~40 squares one game is played with, composed from the pool to D6's tier quotas.
Composition is a hard constraint, and a pool that cannot meet it is refused rather than
approximated (ADR-0002). `apps/api/src/games/deck.ts`.

**Card** — the 24 squares one player is dealt from the room's deck, plus a free centre, laid out
5×5 (D4). Dealt from the *deck*, never from the pool — the 24-of-40 overlap is what puts each square
on ~3.6 of 6 cards, and it is the reason a call has anyone to matter to. Bounded in its own right, on
top of the deck's quotas: at most 5 *rare* and at least 6 *certain*, because the deck's tier mix does
not reach a 24-square subset of it on its own.

**Free centre** — the middle cell, theme-flavoured ("LIGHTS OUT"). Not a pool square and not
"always marked": nothing has to happen for it to count, so lines through it are complete when their
other four squares are (`apps/api/src/games/lines.ts`).

**Tier** — a square's per-race probability of being broadcast: `certain` ≈ fires most races, `medium`
≈ roughly every other race, `rare` ≈ a few times a season. The TV broadcast is the evidence a call is
judged against, so a tier is a claim about what the coverage shows, not about what happens on track.
Pacing is governed by a card's rarity mix, not by pool size (D6).

**Entity tier** — a theme's own ordinal plausibility rating for the people and teams in it; in F1,
`podium` / `points` / `field`. Templates gate on it to decide whether a square exists for an entity at
all, and at which *Tier* if it does — the same ambition is `certain` for one entity, `rare` for
another, and absent for a third. Distinct from *Tier*: each theme names its own entity tiers, whereas
square tiers are fixed game-wide vocabulary.

## Calling, and taking it back

**Call** — the act, and the `CALL` row it appends: someone saw the event, so the square is marked
for *everyone* holding it. Players may call only squares on their own card; the host may call any
square in the deck (D7). One square, one live call — a tied race is won by whoever's row landed,
and the loser is handed the winner's call rather than an error. That is arbitrated by the lock the
call already takes on the game row, not by a uniqueness constraint (ADR-0004).

**Mark** — a square that counts as called, together with the `CALL` row that marked it
(`Mark` in `apps/api/src/games/calls.ts`). Never stored. It is derived, per read, from one formula:

```
marks(player) = card.square_ids ∩ {CALLs not superseded by a RETRACT}
```

Marks, the deck sheet's called set, the standings, the timeline and the win ladder all come off
that single query, so there is no way for them to disagree. It is also why a phone that slept
through a stint needs no catch-up path — it re-reads the answer instead of replaying to it.

**Retract** — a correction, appended as a `RETRACT` row naming the `CALL` it supersedes by `seq`.
Never a delete: deleting would break `Last-Event-ID` replay for every device that already saw the
row (D8).

**Re-call** — calling a square whose call was taken back. It is an ordinary call: liveness is
"no `RETRACT` names this row", so the superseded call does not block a new one, and the re-call is a
fresh `CALL` row at a higher `seq` rather than an edit of the old one. So one square can carry
several `CALL` rows over a game, of which at most one is live — the credit in the timeline and the
standings goes to whoever made the *live* one (ADR-0004).

**Re-roll** — an authenticated `POST /games/:id/card/reroll` with no body. It immediately replaces
the player's card, as often as they want, while the current card has no live marks (D15). It appends
a `CARD_REROLLED` row and stores that row's sequence as the card's latest claim boundary. Candidate
cards are deterministic from the game seed, player, previous boundary, and attempt number; a pure
reordering is not a different card.

**Undo window** — the fast path of D8: for a few seconds after your own call, a one-tap undo row,
no confirmation. Past it, the slow path — tap your own marked square, confirm, retract.

**Host retract** — D8's third path: the host may take back anyone's call, at any time. Reachable for
every call in the game since #46 — from the card for a square the host holds, and from the deck sheet
for the rest.

**Host deck sheet** — the admin surface listing the room's whole deck, visibly not a card, from
which the host calls squares that are not on their own (D7) — and takes them back, which for the ~16
deck squares on no card of theirs is the only surface that can (#46).

## Winning

**Win ladder** — `LINE` → `TWO_LINES` → `FULL_HOUSE`, in that order (D5). `LADDER` in
`apps/api/src/games/prizes.ts`.

**Rung** — one kind on that ladder. A rung is won once per game, and the next is only reachable
after it. Co-winners are allowed: several players may take the same rung at once.

**Prize** — a `PRIZE` row recording that a player took a rung, written in the same transaction as
the call that earned it.

**Full house** — the last rung. Taking it closes the game: `state='done'`, `ended_at` set, and every
later call and retraction refused with 409. One-way (ADR-0003).

**Standings** — the room ranked by raw mark count: every mark on the card, whether or not it counts
towards a win (D5). Read "Final standings" once the game is `done`.

**Timeline** — every call in the game, newest first, stamped with elapsed game time (`+42:10`) and
credited to its spotter. Elapsed wall-clock since the host started — never a lap number, because
there is no timing feed.

**Spotter** — whoever made a call, as the room credits them: "Bea spotted Square 7". A device names
a square only when it holds its prose, so calls for squares off your card read "spotted a square".
That is consistency with the card, not secrecy — the stream already ships `squareId` everywhere.

## Joining late

**Late join** — joining a room whose game is already `live`. The joiner is dealt a card from the
deck already in play, not a fresh draw (`apps/api/src/games/late-join.ts`).

**Inherited mark** — a live mark on the current card for a call made before its current claim
boundary, whether that boundary came from joining or re-rolling. It counts towards the standings
but towards no win (`claimableSquares` gates on `claimBoundarySeq`), and it renders grey rather than
green — so a line already complete at the boundary reads as something to look at rather than
something to claim.

## The two layouts

The room screen has two, and which one applies is decided by width alone — a pure CSS switch at
Tailwind's stock `lg` (1024px), never by a device name (#12's C1, built in #13 and #14).

**Phone layout** — one column. The card, with "what am I looking for" as a collapsible block under
it, and the *Race* surface behind a `Card` | `Race` segmented control. `ipad-11-portrait` (834) gets
this too, with much larger cells: it is a comfortable single column, not a stretched phone.

**Two-pane layout** — the card alone on the left, a **pane** on the right, at `ipad-11-landscape`
(1194) and above. Named for an iPad propped next to the TV, which is plausibly the *primary* device
(D14). Both columns are fixed to the viewport and each scrolls itself: a page that scrolls would move
the card, and a card that moves is the thing two columns are for.

**Pane** — the right column of the two-pane layout, and only that. Itself tabbed, **Looking for** |
**Race**, opening on the list: early in a race what you want is what to watch for, not a timeline of
what already happened. A *surface* is the phone layout's whole-screen equivalent; a pane is beside the
card rather than instead of it.

Both layouts' markup is in the document at every width — the price of a CSS-only switch, paid so that
rotating mid-game cannot remount the screen and drop the stream. `docs/SURFACES.md` carries the
consequences.

## Identity

**Player** — a display name plus a server-issued token held in `localStorage`, per browser. No
accounts (D11).

**Host** — the player who created the room. Holding a deck *is* the entitlement: only the host is
handed one, so no separate "am I the host" check can disagree with the server's.
