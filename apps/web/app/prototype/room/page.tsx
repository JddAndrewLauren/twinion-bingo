'use client';

/**
 * PROTOTYPE for #12 — three variants of the room screen, switchable via
 * `?variant=A|B|C` on this one route, running on mock state and no API.
 *
 * Throwaway. It exists to settle two things on real hardware, which a resized
 * desktop browser cannot settle: 68pt-cell legibility at 390pt portrait, and
 * whether the landscape iPad wants a layout of its own. Judge it on a phone and on
 * an 11" iPad in both orientations, record the decision on #12, then delete this
 * whole folder. Nothing here obliges #13 or #14 beyond that decision.
 *
 * Not mounted inside `/r/[code]`, which would have been the preferred shape,
 * because that route is a live client that reads a roster, a game and an SSE
 * stream from the API — gating it on a search param would have put prototype
 * branches through production code for the sake of avoiding a folder.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PrototypeSwitcher } from '../prototype-switcher';
import { VariantA, NAME as NAME_A } from './variant-a';
import { VariantB, NAME as NAME_B } from './variant-b';
import { VariantC, NAME as NAME_C } from './variant-c';
import type { LabelSet } from './mock-state';

const VARIANTS = ['A', 'B', 'C'];
const NAMES: Record<string, string> = { A: NAME_A, B: NAME_B, C: NAME_C };

export default function PrototypeRoomPage() {
  return (
    <Suspense>
      <Variants />
    </Suspense>
  );
}

function Variants() {
  const params = useSearchParams();
  const asked = params.get('variant') ?? 'A';
  const variant = VARIANTS.includes(asked) ? asked : 'A';
  const labels: LabelSet = params.get('labels') === 'real' ? 'real' : 'cap';

  return (
    <>
      {variant === 'A' && <VariantA labels={labels} />}
      {variant === 'B' && <VariantB labels={labels} />}
      {variant === 'C' && <VariantC labels={labels} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        name={NAMES[variant] ?? ''}
      />
    </>
  );
}
