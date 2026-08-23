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
 *
 * `role="progressbar"` with the three `aria-value*` attributes, rather than
 * `role="img"`: the 12 segments are a coarse *rendering* of `marks/total`, and a
 * progress bar is what a reader is actually being handed. The `aria-label` stays
 * the same sentence either way, so it is still the thing the gate and the unit
 * tests query on.
 */
const SEGMENTS = 12;

export function ProgressReadout({ marks, total }: { marks: number; total: number }) {
  const filled = Math.round((marks / total) * SEGMENTS);

  return (
    <div
      role="progressbar"
      aria-label={`${marks} of ${total} marked`}
      aria-valuenow={marks}
      aria-valuemin={0}
      aria-valuemax={total}
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
      {/*
        #105 (Slipstream): split into a count span and a total span so a skin
        can size the numeral apart from the "/ N" it sits beside — the handoff's
        own "numeral only ... with `/ 24 MARKED` beneath". Both are aria-hidden
        (the accessible text is the `role="progressbar"` aria-label above), so
        restructuring the visible text costs no test any accessible-name
        assertion; nothing in this file or `gate/skin-pitwall.gate.ts` reads
        this paragraph's own `textContent`.
      */}
      <p className="skin-progress-number text-lg" aria-hidden>
        <span className="skin-progress-count">{marks}</span>
        <span className="skin-progress-of">/{total}</span>
      </p>
    </div>
  );
}
