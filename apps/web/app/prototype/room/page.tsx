'use client';

/**
 * PROTOTYPE for #12 — variants of the room screen on one route, mock state, no API.
 *
 * `?variant=A|B|C|C1|C2|C3`. A/B/C are the original three layouts; C won, so C1-C3
 * are variations on C that differ only in how the "what am I looking for" list is
 * disclosed. C is kept as the baseline with no list at all, because "is the list
 * worth its space" is one of the things being judged.
 *
 * Throwaway. It exists to settle 68pt-cell legibility at 390pt portrait and whether
 * the landscape iPad wants a layout of its own — neither of which a resized desktop
 * browser can settle. Judge on a phone and an 11" iPad in both orientations, record
 * the decision on #12, then delete this folder. See NOTES.md.
 */

import { Suspense } from 'react';
import { notFound, useSearchParams } from 'next/navigation';
import { PrototypeSwitcher } from '../prototype-switcher';
import { VariantA, NAME as NAME_A } from './variant-a';
import { VariantB, NAME as NAME_B } from './variant-b';
import { VariantC, NAME as NAME_C } from './variant-c';
import { VariantC1, NAME as NAME_C1 } from './variant-c1';
import { VariantC2, NAME as NAME_C2 } from './variant-c2';
import { VariantC3, NAME as NAME_C3 } from './variant-c3';
import { asLabelSet, type LabelSet, type Stage } from './mock-state';

const VARIANTS = ['A', 'B', 'C', 'C1', 'C2', 'C3'];

const NAMES: Record<string, string> = {
  A: NAME_A,
  B: NAME_B,
  C: `${NAME_C} (no list — baseline)`,
  C1: NAME_C1,
  C2: NAME_C2,
  C3: NAME_C3,
};

export default function PrototypeRoomPage() {
  /*
    The *route*, not just the switcher.

    Gating only the fuchsia bar was not enough: this page still built as `○
    /prototype/room` and would render a fake room, with fake players and a fake
    result, on a public URL — and once it carried webfonts it shipped their bytes to
    every visitor as well. `NODE_ENV` is inlined at build, so in a production build
    this collapses to an unconditional `notFound()` and the page prerenders as a 404.

    Deleting `apps/web/app/prototype/` belongs to #14. This is what keeps the gap
    between now and then from being a deploy hazard.
  */
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <Suspense>
      <Variants />
    </Suspense>
  );
}

function Variants() {
  const params = useSearchParams();
  const asked = params.get('variant') ?? 'C1';
  const variant = VARIANTS.includes(asked) ? asked : 'C1';
  /**
   * The length axis: `?labels=short|real|cap|long`, shortest to over-cap. Paired with
   * `?text=S|M|L|XL`, which `ProtoCard` reads itself — between them they answer how
   * much a 68pt cell can be asked to say.
   */
  const labels: LabelSet = asLabelSet(params.get('labels'));
  /**
   * `?stage=start` is lights out: nothing called, so the list is all 24 rows — its
   * worst case, and the only state where the longest descriptions are on screen at
   * all, since the list carries open squares and `mid` has already marked the
   * squares whose prose runs longest.
   */
  const stage: Stage = params.get('stage') === 'start' ? 'start' : 'mid';

  return (
    <>
      {variant === 'A' && <VariantA labels={labels} stage={stage} />}
      {variant === 'B' && <VariantB labels={labels} stage={stage} />}
      {variant === 'C' && <VariantC labels={labels} stage={stage} />}
      {variant === 'C1' && <VariantC1 labels={labels} stage={stage} />}
      {variant === 'C2' && <VariantC2 labels={labels} stage={stage} />}
      {variant === 'C3' && <VariantC3 labels={labels} stage={stage} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        name={NAMES[variant] ?? ''}
      />
    </>
  );
}
