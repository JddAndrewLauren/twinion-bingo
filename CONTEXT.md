# Context: TwinIon Bingo

The language this project speaks. `PLAN.md` holds the design and its numbered decisions (D1–D14);
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
`PLAYER_JOINED`, `GAME_STARTED`, `CALL`, `RETRACT`, `PRIZE`.

## Squares and where they come from

**Pool** — a theme's whole authored body of squares (~180 at full size), committed to the repo as
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
and the loser is handed the winner's call rather than an error.

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

**Undo window** — the fast path of D8: for a few seconds after your own call, a one-tap undo row,
no confirmation. Past it, the slow path — tap your own marked square, confirm, retract.

**Host retract** — D8's third path: the host may take back anyone's call, at any time. The host's
reach through the UI is currently narrower than the rule (see #46).

**Host deck sheet** — the admin surface listing the room's whole deck, visibly not a card, from
which the host calls squares that are not on their own (D7).

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

**Inherited mark** — a mark on a late joiner's card for a call made *before* they joined. It counts
towards the standings but towards no win of theirs (`claimableSquares` gates on `joinSeq`), and it
renders grey rather than green — so a line that was already complete at join reads as something to
look at rather than something to claim.

## Identity

**Player** — a display name plus a server-issued token held in `localStorage`, per browser. No
accounts (D11).

**Host** — the player who created the room. Holding a deck *is* the entitlement: only the host is
handed one, so no separate "am I the host" check can disagree with the server's.
