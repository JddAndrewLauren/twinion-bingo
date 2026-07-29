# 0002 — The deck composer holds D6's quotas as hard constraints, and refuses a pool that cannot meet them

**Status:** accepted, 2026-07-28 · **Issue:** #7 · **Supersedes nothing** · **Revisit when:** #16 lands

## Context

D6 fixes a room's deck at ~40 squares in a 13 certain / 20 medium / 7 rare mix, with a source
quota of ~24 hand-crafted to ~16 generated and at most ~2–3 squares from any one template. Cards
are 24 squares dealt from that deck (D4), and the 24-of-40 overlap is the entire justification for
dealing from a room deck rather than independently from the pool: it puts each square on ~3.6 of 6
cards, so a caller is nearly always watching.

The committed F1 pool is a 47-square starter from #6, and it cannot supply that deck. Three of
#7's acceptance criteria are simultaneously unsatisfiable against it:

| | pool has | a deck wants |
| --- | --- | --- |
| total squares | 47 | 40 |
| certain | 8 | 13 |
| medium | 29 | 20 |
| rare | 10 | 7 |
| hand-crafted | 5 | ~24 |
| generated | 42 | ~16 |

The binding constraint is not the total. It is the per-template cap: five templates at a cap of 3
yield at most 15 template squares, plus 5 hand-crafted, so **20 squares is the largest deck that
can be drawn at all** — and a 24-square card cannot be dealt from a 20-square deck. Below 24 deck
squares there is no playable game, only a lower-fidelity one.

#16 ("author the F1 pool to ~180 squares") owns exactly these numbers; its own criteria name the
~24-of-40 hand-crafted quota and the 13/20/7 mix. #7's numbers were written against a pool that
does not exist yet.

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
- **`POST /rooms/:code/games` does not work against `f1.v1` until #16 lands.** That is deliberate
  and loud. A room can be created and joined; starting a game 503s with the shortfall.
- When #16 lands, `deck.test.ts`'s "refuses, naming the quotas the starter pool cannot reach"
  should start failing. That is the signal to turn it into a composition test against the real
  pool, and to drop the fixture's role as the only pool large enough to exercise the quotas.
- The `~` in "~40" and "~24" is read as authoring tolerance on the pool, not as licence for the
  composer to pick its own numbers. The exact numbers are pinned as literals in
  `deck.test.ts`, so changing one is a deliberate act.
