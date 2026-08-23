import { expect, test, type Locator, type Page } from '@playwright/test';
import { forEachSkin, openRoom, settleSkinFonts } from './room-fixture';
import {
  expectBesideTheCard,
  expectNoCellClipped,
  expectNoHorizontalScroll,
  expectNoVerticalScroll,
  expectThumbSized,
} from './measure';

/**
 * #109's own gate: not a fourth copy of `room.gate.ts` run at four skins — that
 * would be 576 WebKit tests (36 × 4 viewports × 4 skins) for behaviour, state,
 * tabs, panes, dialogs and the stream that no skin can touch. Only the seven
 * assertions a skin's own CSS *can* break run here, each at all four
 * `docs/SURFACES.md` viewports (Playwright's own per-project fanout) and all
 * four skins (`forEachSkin`, looping inside the test body): cell clipping
 * (marked and unmarked), horizontal scroll, vertical scroll at
 * `ipad-11-landscape`, thumb-sized header controls, the header's line count,
 * `expectBesideTheCard` at `ipad-11-landscape`, and `/legibility`'s worst 24 —
 * the exact list this issue's brief names, no more.
 *
 * Everything else — tabs opening the right panel, a call landing, a dialog's
 * focus trap, the stream surviving a rotation — is skin-independent (an
 * identical React tree across skins is `docs/adr/0009-skin-css-variable-layer.md`'s
 * whole argument) and stays gated once, at the default skin, in
 * `room.gate.ts`/`lobby.gate.ts`/`legibility.gate.ts`/`share.gate.ts`.
 *
 * **What this file does not cover, said plainly, per the brief's own
 * instruction not to let a bound read as "covered everything":**
 *
 * - Colour (`paintedFill`/`deltaE`/`ringColour`) is each skin's own business,
 *   already gated per-skin in `skin-pitwall.gate.ts`, `skin-slipstream.gate.ts`,
 *   `skin-confetti.gate.ts` and `skin-scorecard.gate.ts`. This issue's brief
 *   does not ask for a colour sweep across all four skins in one file, and
 *   consolidating those four near-duplicate instruments is explicitly a
 *   FINAL-GATE job, not this issue's.
 * - `expectDieMatchesTheme` (the die's box against the Theme button's own
 *   rendered height) is not re-swept here. `room.gate.ts`'s own
 *   `holds the die and the Theme button beside the room code and Share`
 *   already cycles all four skins via the button, at all four viewports,
 *   which is the same four-skins-by-four-viewports shape this file's own
 *   matrix uses — adding a second copy that reaches the same four skins by
 *   cookie instead of by tap would duplicate an assertion already in the
 *   suite, which the brief's own acceptance criteria rule out.
 * - The two-pane assertions (`expectNoVerticalScroll`, `expectBesideTheCard`)
 *   only run at `ipad-11-landscape`; the other three viewports list the test
 *   as skipped rather than weakened, the same convention `room.gate.ts`'s own
 *   `twoPane()` skips use.
 * - Only one stage's worth of "beside the card" is swept (`mid`, which is
 *   also what proves the pane's `Looking for`/`Race` tabs both still open in
 *   every skin) — not the empty-list and full-house states `room.gate.ts`
 *   already covers once at the default skin.
 *
 * **`settleSkinFonts` (#107) runs after every `openRoom`/`page.goto` below,
 * before any measurement.** Reaching a skin by cookie rather than by tap means
 * each iteration is a *fresh navigation* that already loads in its target
 * skin — not the live, already-painted-page skin swap #107's own account
 * diagnosed, where `document.fonts.ready` awaited once after the *initial*
 * `page.goto` (in the default skin) said nothing about a face requested by a
 * later, in-page skin change. `openRoom`'s own built-in `document.fonts.ready`
 * wait, taken right after the same navigation that requested this skin's own
 * faces, is therefore already correct for the case this file is in — the same
 * reasoning every other `skin-*.gate.ts` file relies on, none of which call
 * `settleSkinFonts` either. It is called anyway, defensively: this file's own
 * header-line-count assertion is the *same shape* of measurement #107's CI run
 * found broken by font-swap timing (a `phone-small` wrap that passed locally
 * and failed on a cold runner), so the extra, free re-assertion of
 * `document.fonts.ready` plus `document.fonts.load()` for every element
 * actually on screen costs nothing and removes any doubt on the one assertion
 * in this file most likely to be sensitive to it.
 */

const landscapeOnly = () => test.info().project.name === 'ipad-11-landscape';

test.describe('the card, at every skin', () => {
  /**
   * Both card states the brief names, per skin: `start` (all 24 unmarked) and
   * `mid` (some earned, some inherited, the rest still open) — a single state
   * cannot stand for both. #13's own history is the reason: a cell is fitted
   * for the *marked* weight and only re-fits when a label's text changes, so a
   * defect that only shows up once a cell has actually been marked is
   * invisible to a run that only ever opens `start`.
   */
  test('clips no cell, marked or unmarked, at any skin', async ({ page }) => {
    await forEachSkin(page, async (skin) => {
      await openRoom(page, 'start');
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      await settleSkinFonts(page);
      await expectNoCellClipped(page);
      await expectNoHorizontalScroll(page);

      await openRoom(page, 'mid');
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      await settleSkinFonts(page);
      await expectNoCellClipped(page);
      await expectNoHorizontalScroll(page);
    });
  });
});

test.describe('the header, at every skin', () => {
  /**
   * The three controls this row can hold at once (`start`, where the die is
   * offered) plus the room code heading and the stats line — thumb-sized and
   * on one line, the same pair `room.gate.ts`'s own die/Theme test already
   * asserts for the *default* skin's four-skin button cycle. This is the
   * cookie-seeded, all-four-viewports version of the same claim.
   */
  test('keeps every control thumb-sized and the header on one line', async ({
    page,
  }) => {
    await forEachSkin(page, async (skin) => {
      await openRoom(page, 'start');
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      await settleSkinFonts(page);

      const bar: Locator = page.getByRole('banner').or(page.locator('header')).first();
      const dice = bar.getByRole('button', { name: 'Re-roll card' });
      const theme = bar.getByRole('button', { name: 'Theme' });
      const share = bar.getByRole('button', { name: /Share/ });

      await expectThumbSized(dice.locator('[data-hit-expand]'), `the die's hit element in ${skin}`);
      await expectThumbSized(theme.locator('[data-hit-expand]'), `the Theme button's hit element in ${skin}`);
      await expectThumbSized(share, `the Share button in ${skin}`);

      for (const row of ['h1', '> p']) {
        const lines = await bar.locator(row).first().evaluate((node) => {
          const box = node.getBoundingClientRect();
          return box.height / parseFloat(getComputedStyle(node).lineHeight);
        });
        expect(lines, `the slim bar's ${row} holds one line in ${skin}`).toBeLessThanOrEqual(1.01);
      }

      await expectNoHorizontalScroll(page);
    });
  });
});

test.describe('the two-pane layout, at every skin', () => {
  test.beforeEach(() => {
    test.skip(!landscapeOnly(), 'this layout is `ipad-11-landscape` only');
  });

  const listPane = (page: Page): Locator =>
    page.getByRole('tabpanel', { name: /Looking for/ });

  test('does not scroll the page, and keeps the right pane beside the card', async ({
    page,
  }) => {
    await forEachSkin(page, async (skin) => {
      await openRoom(page, 'mid');
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      await settleSkinFonts(page);

      await expectNoVerticalScroll(page, `the two-pane layout in ${skin}`);
      await expectBesideTheCard(page, listPane(page), `the right pane in ${skin}`);
      await expectNoHorizontalScroll(page);
    });
  });
});

test.describe('legibility, at every skin', () => {
  /**
   * The committed pool's own worst 24 (`legibility.gate.ts`'s claim), swept
   * across all four skins rather than only the default — the smaller
   * per-skin label tokens (Slipstream's `1.9cqw`, Confetti's `2.6cqw`,
   * Scorecard's `1.7cqw`, each narrower than the shared `3cqw`) are exactly
   * the kind of change this matrix exists to catch, and `legibility.gate.ts`
   * itself only ever runs on whichever skin the browser opens on.
   */
  test('carries its own worst 24 labels without a cell clipping', async ({
    page,
  }) => {
    await forEachSkin(page, async (skin) => {
      await page.goto('/legibility');
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      await expect(page.getByLabel('Your card')).toBeVisible();
      await settleSkinFonts(page);

      await expectNoCellClipped(page);
      await expectNoHorizontalScroll(page);
    });
  });
});
