# Handoff — #120, the host deck screen

Written 2026-08-23 from the `orchestrate-sanaa-batch` workspace wrap-up. This is a
phase-boundary handoff: the work needs a human in the loop on three decisions before any
of it can be built, and it carries more context than a batch brief can hold.

## Goal

Build issue #120 — the host deck screen shown at room creation once the session type is
picked: three tier sliders plus a handcrafted/generated slider, all 40 squares listed, veto
per square with an instant free replacement, and a whole-deck re-roll honouring every veto.

## Why now

`orchestrate-sanaa-batch` (PR #142, open, FINAL-GATE approved) just landed the thing #120
was waiting on: `feasibleMix(pool, seed?)` in `apps/api/src/games/deck.ts`, which reports
the min/max each of D6's five quotas can take while a deck still composes and still deals a
24-square card. Those are the slider track bounds. The same branch also generalised
`composeDeck`/`assertPoolCanSupply` into `composeToQuotas`/`poolShortfalls`, which is the
API the confirm path calls with the host's chosen mix.

## Blocked — check this first

#120's own body lists two blockers. Only one is cleared:

- ~~#114's feasible-mix slice~~ — **done** (#119, merged into the batch as `8e7c356`).
- **#114's session-types slice — not done.** #118 ("Session types (quali / sprint / race) as
  per-square applicability") is still open and labelled `needs-grilling`. #120's screen is
  defined as appearing *"once the session type is picked"*, and `feasibleMix` takes a pool
  **already filtered to a session type**. So the filtering input this screen is built on top
  of does not exist yet.

  **This is the first thing to settle.** Either grill and land #118 first, or consciously
  build #120 against an unfiltered pool with the session-type filter stubbed at a single seam
  — and say which, because it changes the shape of the persistence work below.

## The three decisions that need you

### 1. What the confirm path does when a feasible-looking mix fails to compose

This is the sharp one, and it is a genuine constraint rather than defensive coding.

`feasibleMix` reports a range **per quota**, and each range boundary is established by a
**single witness mix** — not by a joint search. So a mix that sits inside every reported
per-quota range is **not** guaranteed to compose under an arbitrary seed. The doc comment on
`FeasibleMix` says this explicitly (it was rewritten in review round 1 of PR #141 precisely
because it originally overclaimed a joint guarantee), and it names #120's confirm path as
the thing that therefore still has to handle `DeckCompositionError`.

ADR-0002 says refuse rather than approximate, so silently nudging the mix is out. That
leaves roughly:

- **Retry with fresh seeds, then surface.** Cheap, usually invisible, but has no bound
  unless you pick one.
- **Surface immediately** with a "this combination will not compose, try moving X" message.
  Honest; violates #120's own acceptance criterion that a host reaches a playable room
  "without ever seeing an error state".
- **Constrain the sliders jointly** — make the tracks depend on the other sliders' current
  positions rather than being fixed. Removes the failure entirely, but needs a joint search
  `feasibleMix` does not currently do, and that is a real piece of work in `deck.ts`.

The acceptance criterion and the guarantee are in tension. Pick one and adjust the other.

### 2. The persistence shape

#120 says the **recipe, the veto list and the seed** live on the **room**, so a deck is
reproducible rather than stored as 40 opaque ids. `composeDeck(pool, seed)` is pure today;
vetoes and custom quotas are extra inputs it needs to stay pure.

`rooms.deck` (the 40 ids) already exists — ADR-0010 put it there, migration `0005`. So the
question is whether the id list stays as a denormalised cache alongside the recipe, or is
replaced by it. That is a schema migration and an ADR amendment either way, and it interacts
with decision 1: if the confirm path can fail, the stored recipe has to be one that is known
to have composed.

### 3. `phone-small` behaviour, stated before building

#120 explicitly asks for this, and `docs/SURFACES.md` gates it. 40 squares plus four
sliders is the densest screen in the app. Decide and write down how the list behaves at
`phone-small` (scroller? collapsed sections? sliders pinned?) **before** any layout code, then
add the `docs/SURFACES.md` row and write the acceptance criteria against named viewports.

## Context and files to load

**Read first**
- Issue #120 (`gh issue view 120`), and #114 for the parent framing.
- `apps/api/src/games/deck.ts` — `feasibleMix`, `composeToQuotas`, `poolShortfalls`,
  `selectableCount`, `cardBoundsShortfalls`, and the `FeasibleMix` doc comment (decision 1
  lives in that comment).
- `apps/api/test/feasible-mix.test.ts` — what is actually proven about the ranges, including
  the declared scope limit: "one step outside fails" is proved for the committed F1 pool but
  not for arbitrary synthetic pools, because a square holding several exclusivity groups can
  let an out-of-bounds mix still deal.
- `docs/adr/0010-a-room-is-one-session.md` — the room owns the deck now.
- ADR-0002 (refuse rather than approximate) — the constraint decision 1 is bounded by.

**Then**
- The existing in-game **host deck sheet** — #120 asks you to reuse its presentation and keep
  the new screen visibly not a card. `docs/SURFACES.md` lines for "Game — host deck sheet"
  and "Game — retract dialog over the sheet" describe its established behaviour.
- `apps/api/src/games/store.ts` `startGame` — where a composed deck currently gets written.

## In-flight work to reconcile before starting

At the time of writing, a sibling session had **uncommitted** changes in this same checkout
touching `deck.ts`, `store.ts`, `routes.ts`, `schema.ts` and ADR-0010. Two of them matter here:

- `composeToQuotas` gains an `assertQuotasDescribeADeck` guard — arbitrary quotas that do not
  sum to `DECK_SIZE`, or that are negative/non-integer, now throw with a named message. The
  comment on it calls out #120's slider-confirm path as the reason it is a real check rather
  than an assertion about constants. **Your confirm path will hit this**; treat it as the
  contract.
- `GameAlreadyLive` is renamed `GameAlreadyStarted` and the rule widens so a *finished* game
  also refuses a second start.

Fetch `main` and re-read these files before trusting any signature quoted above.

## Related

- **#143** — `startGame`'s live-game check races, and after ADR-0010 a double start overwrites
  the room's deck. Filed during this wrap-up, `ready-for-agent`. Not a blocker for #120, but
  it touches the same write path, so land it first if both are in flight.
- **PR #142** must be merged to `main` before #120 starts; everything above assumes it.
