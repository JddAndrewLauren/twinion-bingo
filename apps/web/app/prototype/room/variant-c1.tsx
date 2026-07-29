'use client';

/**
 * PROTOTYPE — Variant C1: C, plus one collapsible block under the card.
 *
 * The most literal reading of the ask. One heading with a count, collapsed by
 * default so the card is untouched until you want the list, and everything at once
 * when you open it.
 *
 * What to watch for on hardware: opened at lights out this is 24 squares and a
 * long scroll on a phone, and the card scrolls away above it. The count in the
 * heading is doing a second job — it is the only bit of the list you can read
 * while it is shut.
 */

import { CShell } from './variant-c-shell';
import { LookingForAccordion } from './looking-for';
import type { LabelSet } from './mock-state';

export const NAME = 'C + one collapsible block';

export function VariantC1({ labels }: { labels: LabelSet }) {
  return (
    <CShell
      labels={labels}
      belowCard={(game) => <LookingForAccordion game={game} />}
    />
  );
}
