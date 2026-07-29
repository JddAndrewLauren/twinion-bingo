'use client';

/**
 * PROTOTYPE — the floating switcher. Delete when #12's decision is recorded.
 *
 * Deliberately loud and deliberately not part of any design being judged. Hidden
 * outside development, so a stray merge cannot ship it: a prototype route is
 * throwaway, but a bar that escaped into production would be a defect.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function PrototypeSwitcher({
  variants,
  current,
  name,
}: {
  variants: string[];
  current: string;
  /** The current variant's own name, so the bar says what is on screen. */
  name: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const labels = params.get('labels') === 'real' ? 'real' : 'cap';

  function go(step: number) {
    const at = variants.indexOf(current);
    const next =
      variants[(at + step + variants.length) % variants.length] ?? current;
    const query = new URLSearchParams(params.toString());
    query.set('variant', next);
    router.replace(`?${query.toString()}`);
  }

  function toggleLabels() {
    const query = new URLSearchParams(params.toString());
    query.set('labels', labels === 'cap' ? 'real' : 'cap');
    router.replace(`?${query.toString()}`);
  }

  // Arrow keys cycle too, except while something is being typed into.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing) return;

      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;

  return (
    /*
      Clear of the bottom ~120px, because that slot holds the credit toast and D8's
      undo row and whether those cover the card is one of the things being judged —
      a switcher sitting on top of them would hide the evidence.
    */
    <div className="fixed bottom-32 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1.5 text-xs font-semibold text-white shadow-lg shadow-black/50">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="px-2 py-1"
      >
        ◂
      </button>
      <span className="max-w-[52vw] truncate">
        {current} — {name}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="px-2 py-1"
      >
        ▸
      </button>
      {/*
        The second control, because #12 has to decide about D4's <=30 char cap as
        well as about layout, and the two are the same judgement made twice.
      */}
      <button
        type="button"
        onClick={toggleLabels}
        className="ml-1 rounded-full bg-black/30 px-2 py-1"
      >
        {labels === 'cap' ? 'labels: at cap' : 'labels: real pool'}
      </button>
    </div>
  );
}
