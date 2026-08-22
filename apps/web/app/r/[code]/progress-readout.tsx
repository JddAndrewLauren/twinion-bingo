/**
 * A segmented readout of the card's own progress — a structural piece #104
 * builds because the app did not have one. The slim bar's `n/24` stat line
 * already exists (`room-screen.tsx`'s header); this is the handoff's own
 * *Progress readout* region, which every skin draws differently (Pit Wall's a
 * 12-segment bar, Slipstream a bare numeral, and so on) but which none of them
 * had a place to render into before this issue.
 *
 * **A pure function of `marks` and `total` — no state of its own**, per this
 * issue's "drive it from `game.marks.length` against 24 ... do not add state
 * for it." `RoomScreen` passes the same two numbers it already reads for the
 * header line.
 *
 * `SEGMENTS` is Pit Wall's own count (README's *Progress readout per theme*):
 * fixed at 12 rather than derived from `total`, because the handoff's bar is a
 * coarse readout, not one tick per square — a 24-segment bar over 24 squares
 * would just be the grid again.
 */
const SEGMENTS = 12;

export function ProgressReadout({ marks, total }: { marks: number; total: number }) {
  const filled = Math.round((marks / total) * SEGMENTS);

  return (
    <div
      role="img"
      aria-label={`${marks} of ${total} marked`}
      className="skin-progress flex flex-col gap-1"
    >
      <div className="skin-progress-track flex">
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span
            key={index}
            aria-hidden
            data-filled={index < filled ? 'true' : 'false'}
            className="skin-progress-segment h-1 flex-1"
          />
        ))}
      </div>
      <p className="skin-progress-number text-lg" aria-hidden>
        {marks}/{total}
      </p>
    </div>
  );
}
