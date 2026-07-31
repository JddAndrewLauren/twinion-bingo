# ADR-0006: Card re-rolls reset the claim boundary

- **Status:** accepted
- **Date:** 2026-07-30
- **Implemented by:** issue #85

## Context

A player can receive a card whose memberships are already marked by live calls. This happens when
they join late, and it can also happen after a clean card is replaced: calls made before the
replacement may intersect the new card. Marks are derived from the call log, so replacing the card
must not delete or rewrite those calls.

The game still needs a clear answer to a different question: which marks may complete a prize for
this player? The existing late-join rule used the player's `join_seq` as that boundary. A re-roll
needs the same rule without introducing a second source of truth or a counter whose meaning can
drift from the append-only log.

## Decision

Allow an authenticated player to re-roll immediately and repeatedly while their current card has no
live marks. The request has no body and returns the existing `GameView` shape. It is serialized with
calls by the game-row `FOR UPDATE` lock.

For every accepted re-roll:

- generate a deterministic candidate from the game seed, player id, previous claim boundary, and
  attempt number;
- reject candidates whose square membership set is unchanged, even if their order differs;
- append a `CARD_REROLLED` room event with the player, room, and game;
- replace the card and store that event's `seq` in nullable `cards.latest_reroll_seq` in the same
  transaction.

The player's effective claim boundary is:

```text
latest_reroll_seq ?? join_seq
```

Calls before that boundary remain live marks and count in standings, but are inherited marks: they
cannot contribute to any prize. Calls after the boundary remain earned and prize-eligible. A live
mark of either kind prevents another re-roll until it is retracted. The candidate search gives up
after 200 seeded attempts and returns a conflict if no different membership set exists.

## Consequences

Re-rolling permanently gives up prize eligibility for earlier calls that land on the replacement
card, while retaining those calls in the mark derivation, standings, timeline, and stream history.
This makes the trade-off visible and recoverable only through a new clean card, not by deleting
history. A player can choose to keep a clean card for a later prize or take another draw for better
coverage.

The boundary is stored as a log sequence rather than an ordinal re-roll count, so it composes with
the room-scoped SSE cursor and remains meaningful across all other room events. The nullable column
has no foreign key: a relational constraint cannot enforce that the referenced sequence belongs to
the same room, game, player, and `CARD_REROLLED` event together. The transaction maintains all four
facts atomically.
