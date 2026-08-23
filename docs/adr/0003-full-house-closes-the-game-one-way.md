# 0003 — The full house closes the game, and the door does not reopen

**Status:** accepted, 2026-07-28 · **Issues:** #11, #49 · **Supersedes nothing** · **Revisit when:** a room asks for a second race on one game

## Context

D5's ladder ends at the full house. When the last rung is taken, the question is what happens to the
game that was being played: does it keep accepting calls, or is it over?

The pressure to keep it open is real. A race is still running when someone fills their card, other
players still hold unmarked squares, and the room is still watching. "The game ends before the race
does" is a genuine cost, and it is the cost this decision accepts.

The pressure the other way is that every derived view — the standings, the timeline, the ladder
itself — is read out of the log per read, and the ladder's rungs are recorded as appended `PRIZE`
rows. Nothing about them is reversible in the way a `CALL` is: D8's correction model works because a
`RETRACT` *supersedes* a call by naming its `seq`, leaving the call in the log for `Last-Event-ID`
replay. There is no equivalent for a prize. A row saying Bea won the full house cannot be taken back
without either deleting it — which breaks replay for every device that already saw it — or
inventing a second supersede relation for prizes alone.

## Decision

Taking the full house sets `state='done'` and `ended_at`, in the same transaction as the call that
earned it (`awardPrizes`, `apps/api/src/games/prizes.ts`). `done` is terminal: no path sets a game
back to `live`.

Three things follow, and all three are load-bearing:

**The API refuses.** `assertLive` runs under the same `FOR UPDATE` lock a call takes
(`apps/api/src/games/store.ts`), so a call racing the full-house transaction either lands before it
or is refused with 409 — never both, and never in between.

**The clients stop offering.** The card's cells, the host deck sheet's rows, and the undo window are
all withdrawn once the game reads `done` (#49). This is not belt-and-braces on the server check: a
tap that is certain to come back 409 surfaces as "Could not call that square.", which reads as a
broken card rather than as a game that is over. The undo window matters most, because the call that
closes the game is the one that opens it — D8's seconds would otherwise outlive the game they
belong to.

**The room's way forward is a new game.** `startGame` gates on there being no `live` game for the
code, and a `done` one is not `live` — so the host simply starts the next one. The room, its code,
its roster and its theme all persist; that is D13's room/game split doing exactly the work it was
drawn for.

## Consequences

A room that fills a card at half distance watches the rest of the race with a closed game on screen.
They can start another, which deals fresh cards from a freshly composed deck — a different game, not
a resumption. Anyone who wanted the first game's remaining squares to stay callable does not get
that.

Standings and the timeline keep working after `done`, because they are derived rather than gated;
the screen relabels the standings "Final". The card stays on screen, marks and all — it is what the
room looks at afterwards.

The alternative we rejected — a "keep playing past the full house" mode — is not foreclosed, but it
would need its own decision about what the ladder means once its last rung is behind you, and a
supersede relation for `PRIZE` rows if that mode ever allows a correction to a prize-earning call.
Neither is worth designing before a room has asked for it.

## Addendum (#126): a second door to the same one-way state

The full house is not the only way a game reaches `done` any more. An operator can force-end a
stale game from `/admin` — a room whose phones have gone home mid-race, say — through
`forceEndGame` (`apps/api/src/admin/store.ts`). This does not reopen the door this ADR closed; it
adds a second way to walk through it in the same direction.

Everything the Decision section above says about `done` being terminal, the API refusing under the
game row's lock, and the room's way forward being a new game, holds exactly as written — a
force-ended game is `done` in every way a full-house game is, indistinguishable to `readGame`, the
card, the standings and the timeline. The one difference: no `PRIZE` row is written, so a
force-ended game's ladder simply stops wherever it had gotten to, with no winner named for whatever
rung was still open.

The event this decision appends is `GAME_FORCE_ENDED`, not another `PRIZE` — appended so every
connected device learns from the stream rather than only on its next read, the same reason `PRIZE`
rows exist rather than a bare `state` flip. `room_events.actor_player_id` stays `NOT NULL`, and an
admin is not a player, so this row is attributed to the room's host rather than left without an
actor; nothing reads `GAME_FORCE_ENDED` by its actor, so that attribution is never surfaced as a
claim that the host ended their own game.
