# ADR-0008: no team crowding cap, only a per-driver one

- **Status:** accepted
- **Date:** 2026-08-22
- **Implemented by:** issue #123

## Context

#123 caps *crowding*: a card that names one driver several times without any square contradicting
another (exclusivity groups, #121, already stop the contradictions — "Norris wins" and "Norris on
the podium" cannot co-occur because winning implies a podium). Its open sub-decision, to be settled
in the same issue rather than guessed at: does a team get a crowding cap of its own, and does a
driver square count toward its team's count (so "Ferrari double DNF" and "Leclerc DNF" and "Hamilton
DNF" — a team square plus two of its drivers' squares — could not co-occur either)?

## Measurement

`entities.team` (the driver's team pairing, carried on every driver-generated square alongside
`entities.driver`) makes the question measurable directly: composed 500 seeded decks against the
real F1 pool and dealt all 6 players' cards from each (the same 3000-deal shape ADR-0007's
regression suite already runs), counting, per card, the most any one team is named by a dealt
square (driver squares via their team pairing, plus the pool's own team-entity squares such as
`team_double_points`).

- **91.5%** of the 3000 cards (2744) already name some team twice or more — with only the per-driver
  cap in place, no team cap at all.
- The worst card named one team **4** times.
- The per-driver cap itself cost nothing measurable: every one of the 3000 deals filled on the
  first shuffle attempt (`DEAL_ATTEMPTS`'s retry loop, #122, was never exercised).

## Decision

No team cap, in this issue. Every F1 team fields two drivers, and most templates are per-driver
(`driver_wins`, `driver_podium`, `driver_fastest_lap`, ...), so two different drivers on the same
team landing on one card is not a rare edge case the way per-driver duplication was ("the cap will
rarely bind" did not hold for teams) — it is the ordinary shape of a card. A cap that actually bound
at 91.5% of cards is not a small addition on top of the per-driver mechanism; it would routinely
reshape which squares a card can hold at all, which is a deck/card-bounds design question of its
own weight (in ADR-0002's and ADR-0007's terms, not a one-line extension of them) and not something
this issue's brief asked for or sized. #123's acceptance criterion is the per-driver cap alone.

A driver square therefore does not count toward its team either — that half of the sub-decision
falls out of the first half rather than needing its own answer.

## Consequences

`PoolSquare.entities` still carries `team` (via each driver's pairing) even though `dealCard` does
not read it for team crowding, because the field's contract is "every entity this square names", not
"every entity `dealCard` currently caps" — a future team cap, if one is wanted, reads the same data
this issue already computes rather than a new build-time pass. A card can and routinely will name
one team several times over. If a team cap is wanted later, it needs its own issue: the 91.5%/4
numbers above are the starting evidence for sizing it, and it will likely need to revisit the card
bounds (`MIN_CERTAIN_PER_CARD`, `MAX_RARE_PER_CARD`) rather than bolt on cleanly the way the
per-driver cap did.
