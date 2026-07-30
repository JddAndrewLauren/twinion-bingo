# 0002 — The deck composer holds D6's quotas as hard constraints, and refuses a pool that cannot meet them

**Status:** accepted, 2026-07-28 · amended 2026-07-29, see *Update* · **Issues:** #7, #57–#60 · **Supersedes nothing** · **Revisit when:** a theme's pool fails the check, or the per-card bounds prove too tight

## Context

D6 fixes a room's deck at ~40 squares in a 13 certain / 20 medium / 7 rare mix, with a source
quota of ~24 hand-crafted to ~16 generated and at most ~2–3 squares from any one template. Cards
are 24 squares dealt from that deck (D4), and the 24-of-40 overlap is the entire justification for
dealing from a room deck rather than independently from the pool: it puts each square on ~3.6 of 6
cards, so a caller is nearly always watching.

The committed F1 pool was, when this was decided, a 47-square starter from #6, and it could not
supply that deck. Three of #7's acceptance criteria were simultaneously unsatisfiable against it:

| | pool has | a deck wants |
| --- | --- | --- |
| total squares | 47 | 40 |
| certain | 8 | 13 |
| medium | 29 | 20 |
| rare | 10 | 7 |
| hand-crafted | 5 | ~24 |
| generated | 42 | ~16 |

The binding constraint is not the total. It is the per-template cap: five templates at a cap of 3
yielded at most 15 template squares, plus 5 hand-crafted, so **20 squares was the largest deck that
could be drawn at all** — and a 24-square card cannot be dealt from a 20-square deck. Below 24 deck
squares there is no playable game, only a lower-fidelity one.

#16 ("author the F1 pool to ~180 squares") owns exactly these numbers; its own criteria name the
~24-of-40 hand-crafted quota and the 13/20/7 mix. #7's numbers were written against a pool that did
not exist yet.

## Decision

The composer takes D6's quotas as **hard constraints**. It draws a deck that meets every one of
them, or it refuses to draw and says which quotas the pool cannot reach, in numbers. There is no
relaxation, no degradation order, and no soft quota.

The quotas are proved against a committed synthetic 180-square fixture pool
(`apps/api/test/fixtures/pool-180.json`). The real F1 pool has its own test asserting the refusal
and its arithmetic. `POST /rooms/:code/games` answers **503** with the composer's message when the
theme's pool is too thin — a content shortfall in the repo, not a fault in the request and not
something a retry fixes.

## Alternatives considered

**Soft quotas with a documented degradation order.** Relax the source quota first, then the tier
mix, then the cap, hard-failing under 24 drawable squares. Against today's pool that yields a
~24–30 square deck with 5 hand-crafted squares and a ~7/13/6 tier mix: playable, visibly
repetitive, and it makes #7's criteria un-tickable as written. Rejected because the policy would
be invented in code, for a pool that is about to be replaced, and would be dead code the day #16
lands.

**Block #7 on #16.** Keeps the criteria literally checkable, but #16 is `needs-grilling` and #1
calls it the schedule's long pole. Rejected because the machinery is independently valuable and
independently testable.

## Consequences

- Every part of #7 except a working deck against the real F1 theme lands now: the host-only guard,
  the seeded and stored draw, `GAME_STARTED`, `cards` holding `square_ids` only, and the live
  render over the stream.
- **`POST /rooms/:code/games` did not work against `f1.v1`, and would not until #16 landed.** That
  was deliberate and loud: a room could be created and joined, and starting a game 503'd with the
  shortfall. Overtaken by the update below — `f1.v2` composes.
- When #16 lands, `deck.test.ts`'s "refuses, naming the quotas the starter pool cannot reach"
  should start failing. That is the signal to turn it into a composition test against the real
  pool, and to drop the fixture's role as the only pool large enough to exercise the quotas.
- The `~` in "~40" and "~24" is read as authoring tolerance on the pool, not as licence for the
  composer to pick its own numbers. The exact numbers are pinned as literals in
  `deck.test.ts`, so changing one is a deliberate act.

## Update — 2026-07-29: the pool landed, and the quotas moved onto the card

#16's authoring landed as #57–#60, at **300 squares** rather than ~180: `poolVersion: v2`, 230
generated from 11 teams / 22 drivers / 14 templates plus 70 hand-crafted. Three things follow, and
none of them reopen the decision above.

**The refusal is now theoretical for F1, which is the outcome the decision wanted.** `checkPool`
passes against `f1.v2`, a deck composes, and `POST /rooms/:code/games` no longer 503s. The
hard-constraint policy is unchanged and still load-bearing: it is what the *next* theme's pool gets
measured against before anyone plays on it. F1 passing is evidence the policy was cheap, not
evidence it was unnecessary.

**300 squares is accepted; the ~180 target and its ≈60/90/30 tier split are superseded.** The
shipped mix is 40 certain / 191 medium / 69 rare. Retiering to reach the old split was considered
and declined: no deck quota strains against the mix as it stands, and `MAX_PER_TEMPLATE = 3` holds
the generated side to 42 selectable squares however large the pool grows. So pool size buys variety
across a season and not pacing — exactly what D6 says, now with a pool big enough to test it.

**The tier quotas bind the card too, not only the deck.** `composeDeck` meets 13/20/7 across the 40,
but `dealCard` was taking 24 of those 40 with no tier control, so the mix the composer worked for
never reached the card it was drawn for. Measured over 3000 cards: 11.5% held 6–7 rare of 24, worst
case 7 rare against 3 certain — a card that spends the race waiting. A dealt card therefore holds
**at most 5 rare and at least 6 certain**. These are bounds rather than a second quota: the deal
stays a draw from the deck, and they only cut off the tails D6's ~8/~12/~4 always assumed it was
inside.
