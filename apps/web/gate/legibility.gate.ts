import { expect, test } from '@playwright/test';
import { expectNoCellClipped, expectNoHorizontalScroll } from './measure';

/**
 * The committed pool on a real card, at all four `docs/SURFACES.md` viewports.
 *
 * This is a different claim from `room.gate.ts`'s, and both are needed. That file
 * drives a *synthetic* pool padded to the 30-character cap with a 13-character word,
 * so it gates the worst case the cap permits — zero headroom, deliberately, because a
 * gate built on today's pool goes green on labels nobody has written yet. This file
 * gates the pool as committed: the 24 squares of `themes/f1/pool.generated.json` most
 * likely to fail a cell, picked by `app/legibility/worst-labels.ts` rather than by
 * hand, so a reword re-aims it automatically.
 *
 * **Do not touch the synthetic fixture to make this pass.** If a real label clips, the
 * fix is an entry in `themes/f1/overrides.json` plus `pnpm pool:build` — reword the
 * square. Never a smaller font: the shrink floor in `card-grid.tsx` is what makes the
 * 30-character cap mean anything, and lowering it to accept an input is how the cap
 * stops being a constraint at all.
 *
 * The page it drives is also the surface #19's hardware pass is judged on, so a green
 * run here is the floor under that judgement rather than a substitute for it —
 * "unclipped" is measurable and "readable across a room" is not.
 */

test.describe('the committed pool on a card', () => {
  test('carries its own worst 24 labels without a cell clipping', async ({
    page,
  }, info) => {
    await page.goto('/legibility');
    await expect(page.getByLabel('Your card')).toBeVisible();

    // The card's face is `display: 'swap'`, so a measurement taken before the web
    // font lands is a measurement of the fallback's metrics. `card-grid.tsx` re-fits
    // on `fonts.ready` for the same reason; this waits for the same moment.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);

    // What the run actually saw, so a pass says which labels it passed on rather
    // than only that it liked them — the pool moves and this list moves with it.
    info.annotations.push({
      type: 'worst labels',
      description: await page
        .getByLabel('Your card')
        .evaluate((grid) =>
          [...grid.querySelectorAll('[data-label]')]
            .map((label) => label.textContent)
            .join(' | '),
        ),
    });
  });
});
