'use client';

/**
 * PROTOTYPE — Variant C2: C, plus an always-listed set of open squares whose prose
 * opens one at a time.
 *
 * Same place on the screen as C1, opposite disclosure. The labels are always there
 * — so "what is still out there" is a glance, not a tap — and the prose is behind a
 * tap per row, on the theory that you only ever want one description at a time,
 * for the square somebody is arguing about.
 *
 * What to watch for on hardware: 24 rows of 44px is ~1050px of list even collapsed,
 * so the card is pushed a long way up. Whether that is worse than C1's shut block
 * is exactly the thing to feel rather than reason about.
 */

import { CShell } from './variant-c-shell';
import { LookingForRows } from './looking-for';
import type { LabelSet, Stage } from './mock-state';

export const NAME = 'C + labels always, prose one at a time';

export function VariantC2({
  labels,
  stage,
}: {
  labels: LabelSet;
  stage: Stage;
}) {
  return (
    <CShell
      labels={labels}
      stage={stage}
      belowCard={(game) => <LookingForRows game={game} />}
    />
  );
}
