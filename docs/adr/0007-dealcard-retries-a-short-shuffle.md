# ADR-0007: `dealCard` retries a short shuffle rather than tightening the shortfall check

- **Status:** accepted
- **Date:** 2026-08-22
- **Implemented by:** issue #122

## Context

`dealCard` fills a 24-square card in three flat passes over one shuffle, and `cardBoundsShortfalls`
was written to prove that filling correct: count each of the three bounds (total groups, non-rare
groups, certain groups) as plain set sizes, and if all three counts clear their target, the three
passes are guaranteed to reach 24. That proof holds only when every square carries exactly one
exclusivity group, because then each accepted square advances exactly one pass's count by one.

Once a square can carry several exclusivity groups (#121, so that "Norris wins" and "Norris on the
podium" cannot co-occur), a single accepted square can consume more than one group's worth of a
pass's budget at once. The three counts stay necessary — a deck genuinely short of groups still
cannot deal — but they stop being sufficient: a deck can clear all three and still have a shuffle
order in which a multi-group square is offered before the squares it overlaps, wasting slots the
later part of the same pass needed. `dealCard`'s final `squareIds.length !== CARD_SQUARES` check,
written as "meant to be unreachable", becomes reachable. Confirmed directly: a deck built with one
doubled-up square among otherwise-solo groups (`apps/api/test/deck.test.ts`, "dealing a card under
multi-group squares") threw on roughly 45% of 200 trial seeds under the pre-#122 algorithm.

## Options considered

1. **Conservative shortfall check** — recount the three bounds pessimistically (e.g. by the number
   of squares available under some worst-case grouping, rather than distinct group count) so that a
   pass-clears-the-check deck is provably fillable regardless of shuffle order. Cheapest to reason
   about in isolation, but the pessimism can reject decks that would in fact deal on every shuffle
   order that reasonable code would ever draw, and a correct pessimistic bound is a small
   combinatorial proof of its own — one this repo would be inventing from scratch, and one that
   `composeDeck`'s existing "no search" three-pass design was explicitly written to avoid.
2. **Retry and redraw at the deal** — mirror `composeDeck`'s existing `DRAW_ATTEMPTS` retry loop at
   `dealCard`: if a shuffle comes up short of 24, reshuffle (deterministically, from the same seed)
   and try again, up to a bound, before giving up with a named error.

## Decision

Option 2. `dealCard` tries up to `DEAL_ATTEMPTS` (200, matching `DRAW_ATTEMPTS`) independent
shuffles, each seeded from `${seed}:${playerId}` (attempt 0, unchanged from before #122) or
`${seed}:${playerId}:${attempt}` (later attempts), and returns the first one that fills all 24
slots. `cardBoundsShortfalls` is kept as a cheap up-front refusal for decks that are short on their
face — it is still necessary, just no longer sufficient — and `composeDeck`'s own accept-or-redraw
loop is untouched, so deck acceptance stays exactly as permissive as it was.

This was chosen over option 1 because it reuses a pattern the codebase already trusts
(`composeDeck`'s own retry loop), needs no new combinatorial reasoning, and keeps every deck
`composeDeck` currently accepts dealable rather than narrowing that set. The residual risk it
accepts: retrying is empirical, not a proof. A deck can exist whose *every* shuffle order comes up
short (for example, every square sharing one common exclusivity group, so at most one square is ever
selectable) — `cardBoundsShortfalls` cannot see this, since its counts are still only necessary.
Such a deck now fails loudly, after `DEAL_ATTEMPTS` reshuffles, with a named error rather than the
old unconditional "Unreachable" assertion (see the test "gives up with a named error, not a false
assertion, on a truly undealable deck"). The evidence that this residual risk does not bite the
committed pools in practice is the seeded-deal regression suite in `deck.test.ts`: 500 seeds x 6
players (3000 deals) against the real F1 pool, every one of which has to come back 24 squares or the
suite fails outright. The indycar pool cannot compose a deck at all yet (`handcrafted.json` is
empty, so it can never reach `SOURCE_QUOTA.handcrafted`), which is a pre-existing gap unrelated to
this change and out of this issue's scope.

## Consequences

`dealCard` can now cost up to `DEAL_ATTEMPTS` shuffles instead of one, though in practice the first
attempt succeeds for every deck the committed pools draw — the loop exists for the decks that do not.
A deal that exhausts every attempt throws a real, named error identifying the deck's square and group
counts, the same shape of failure `composeDeck` already produces, rather than an assertion that was
supposed to be impossible. `dealCard` stays deterministic across replays: attempt 0 reuses the exact
seed it used before #122, so a game whose deck deals cleanly on the first attempt (every game dealt
before this change, and the overwhelming majority going forward) deals byte-identical cards.
