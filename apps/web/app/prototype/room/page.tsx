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
import { useSearchParams } from 'next/navigation';
import { PrototypeSwitcher } from '../prototype-switcher';
import { VariantA, NAME as NAME_A } from './variant-a';
import { VariantB, NAME as NAME_B } from './variant-b';
import { VariantC, NAME as NAME_C } from './variant-c';
import { VariantC1, NAME as NAME_C1 } from './variant-c1';
import { VariantC2, NAME as NAME_C2 } from './variant-c2';
import { VariantC3, NAME as NAME_C3 } from './variant-c3';
import type { LabelSet } from './mock-state';

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
  const labels: LabelSet = params.get('labels') === 'real' ? 'real' : 'cap';

  return (
    <>
      {variant === 'A' && <VariantA labels={labels} />}
      {variant === 'B' && <VariantB labels={labels} />}
      {variant === 'C' && <VariantC labels={labels} />}
      {variant === 'C1' && <VariantC1 labels={labels} />}
      {variant === 'C2' && <VariantC2 labels={labels} />}
      {variant === 'C3' && <VariantC3 labels={labels} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        name={NAMES[variant] ?? ''}
      />
    </>
  );
}
