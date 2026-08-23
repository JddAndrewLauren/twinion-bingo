import type { CardSquare, Game } from '../../room-api';

/** D5's ladder, in the words a room says out loud. */
const PRIZE_NAMES: Record<string, string> = {
  LINE: 'first line',
  TWO_LINES: 'two lines',
  FULL_HOUSE: 'full house',
};

/**
 * The rungs in the order they have to be climbed — `LADDER` in
 * `apps/api/src/games/prizes.ts`, which is the authority. Repeated here rather than
 * fetched because the read of the game does not carry it, and a client that only
 * needs to name the next rung does not need a round trip to learn three constants.
 */
const LADDER = ['LINE', 'TWO_LINES', 'FULL_HOUSE'] as const;

/**
 * What the room is playing for: the first rung nobody has taken. A rung is won once
 * per game and the next is only reachable after it (D5), so the first unclaimed one
 * is the only one worth naming.
 *
 * Undefined once the full house has gone, which is the same moment the game reaches
 * `done` — there is nothing left to play for, so the header stops claiming there is.
 */
export function nextPrizeName(game: Game): string | undefined {
  const won = new Set(game.prizes.map((prize) => prize.prizeKind));
  const next = LADDER.find((rung) => !won.has(rung));

  return next === undefined ? undefined : PRIZE_NAMES[next];
}

/**
 * Everything the log says about the game so far: the ladder, the standings and
 * the timeline. All three arrive with every read of the game and none of them is
 * state here, which is the whole reason a phone that slept through a stint needs
 * no catch-up — it re-reads the derived answer rather than replaying to one.
 *
 * Below the card rather than beside it: the card is what a thumb is on, and at
 * `phone-small` there is no width to put anything next to it. #14's two-pane iPad
 * layout is where this gets a column of its own.
 */
export function Results({ game }: { game: Game }) {
  const finished = game.state === 'done';

  return (
    <div className="flex flex-col gap-4 text-sm">
      {game.prizes.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="font-semibold">Prizes</h2>
          <ol className="flex flex-col gap-1">
            {game.prizes.map((prize) => (
              <li key={`${prize.seq}:${prize.playerId}`}>
                {/* Same "won" green as a marked cell — left literal, #102's carve-out. */}
                <span className="font-semibold text-emerald-300">
                  {PRIZE_NAMES[prize.prizeKind] ?? prize.prizeKind}
                </span>
                {' — '}
                {prize.name}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-1">
        <h2 className="font-semibold">
          {finished ? 'Final standings' : 'Standings'}
        </h2>
        <ol className="flex flex-col gap-1">
          {/*
            #106: `skin-standing-rank` is an unconditional hook for Confetti's
            own "Standings (desktop left rail): each rank sits in a 20px filled
            circle" — a structural piece no skin before this had a place to
            render into, same pattern as `roster-preview.tsx`'s `+N` row. Every
            other skin renders it and paints nothing against it.
          */}
          {game.standings.map((standing, index) => (
            <li
              key={standing.playerId}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="skin-standing-rank shrink-0 tabular-nums">
                  {index + 1}
                </span>
                <span className="truncate">{standing.name}</span>
              </span>
              <span className="tabular-nums text-muted">
                {standing.marks}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-semibold">Timeline</h2>
        {game.timeline.length === 0 ? (
          <p className="text-muted">Nothing called yet.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {game.timeline.map((entry) => (
              <li key={entry.seq} className="flex gap-2">
                {/*
                  Elapsed game time, not a lap number — there is no timing feed,
                  and on a recording this is wall-clock since the host started,
                  pauses included. Fixed-width so the column reads as a column.
                  Negative once LIGHTS_OUT lands (#124): a call spotted while
                  the grid was still forming.
                */}
                <span className="w-14 shrink-0 tabular-nums text-muted">
                  {entry.elapsed}
                </span>
                <span className="min-w-0">
                  {entry.kind === 'LIGHTS_OUT' ? (
                    // The race-start marker (#124), not a spotted square — it
                    // has no `squareId` because it is not one.
                    <span className="font-semibold uppercase">Lights out</span>
                  ) : (
                    <>
                      <span className="font-semibold">{entry.name}</span>
                      {' spotted '}
                      {labelFor(game.card, entry.squareId) ?? 'a square'}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/**
 * A square is named only when this device knows its prose — the same rule the
 * spotter toast follows, and for the same two reasons: consistency with that
 * toast, and not shipping the whole 40-square deck to a client that needs 24.
 *
 * It is NOT a secrecy measure, and must not be inherited as one. Square ids are
 * semantically transparent (`f1.v1:driver_retires:VER`), and every CALL frame on
 * the stream already carries `squareId` to every device in the room — see
 * `readEventsAfter` in `apps/api/src/rooms/events.ts`. A device therefore already
 * learns the identity of every called square, and withholding the label hides
 * prose the id spells out. Nothing here is kept back that #8's stream did not
 * surface first.
 *
 * Consequence worth naming for #14: a 40-square deck against a 24-square card
 * means roughly 40% of timeline rows read "X spotted a square".
 */
function labelFor(
  card: CardSquare[] | null,
  squareId: string,
): string | undefined {
  return card?.find((square) => square.id === squareId)?.label;
}
