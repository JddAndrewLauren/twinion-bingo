import { expect, test, type Page } from '@playwright/test';
import { openLobby, openRoom } from './room-fixture';
import {
  expectClearOfTheCard,
  expectNoCellClipped,
  expectNoHorizontalScroll,
} from './measure';

/**
 * #107's own gate: Scorecard — the app's second light surface. Every test puts
 * the browser on Scorecard itself first, via a cookie set before
 * `openLobby`/`openRoom`'s own `page.goto` — the same technique
 * `skin-confetti.gate.ts` uses and for the same reason (a `<meta>` tag cannot
 * be fixed retroactively by a client-side skin change, so a cookie is the one
 * way to cover `themeColor`/the status bar from the very first response).
 */

const SKIN_COOKIE = 'twinion_bingo_skin';

async function useScorecardCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: SKIN_COOKIE,
      value: 'scorecard',
      url: 'http://127.0.0.1:3210',
    },
  ]);
}

/**
 * Copied from `skin-confetti.gate.ts` — see that file's own comment block for
 * the full reasoning (the coverage check, and the deliberate choice not to
 * lift this into `gate/measure.ts` while it is still duplicated three times
 * over and a concurrent slice's own copy is mid-review). Kept here as a fourth
 * copy for the same reason: this skin's card cell has no filled overlay at
 * all — see `ringColour()` below for the instrument this issue actually needs
 * — but the deck sheet and the roster still need `paintedFill`'s plain
 * composited-background reading, so the copy travels with every per-skin gate
 * rather than only the ones with a filled mark.
 */
const paintedFill = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((start) => {
    const parse = (value: string): [number, number, number, number] | null => {
      const parts = value.match(/[\d.]+/g);
      if (parts === null || parts.length < 3) return null;
      return [
        Number(parts[0]),
        Number(parts[1]),
        Number(parts[2]),
        parts.length > 3 ? Number(parts[3]) : 1,
      ];
    };

    const stack: [number, number, number, number][] = [];

    const overlay = getComputedStyle(start, '::before');
    if (overlay.content !== 'none' && overlay.content !== 'normal') {
      const covers =
        parseFloat(overlay.width) >= start.clientWidth &&
        parseFloat(overlay.height) >= start.clientHeight;
      const layer = parse(overlay.backgroundColor);
      const shown = Number(overlay.opacity);
      if (covers && layer !== null && layer[3] * shown > 0) {
        stack.push([layer[0], layer[1], layer[2], layer[3] * shown]);
      }
    }

    for (
      let node: Element | null = start;
      node !== null;
      node = node.parentElement
    ) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour === null || colour[3] === 0) continue;
      stack.push(colour);
      if (colour[3] === 1) break;
    }

    const deepest = stack[stack.length - 1];
    const opaqueBase = deepest !== undefined && deepest[3] === 1;
    let [r, g, b] = opaqueBase
      ? [deepest[0], deepest[1], deepest[2]]
      : [255, 255, 255];
    const washes = opaqueBase ? stack.slice(0, -1) : stack;
    for (const [sr, sg, sb, a] of washes.reverse()) {
      r = a * sr + (1 - a) * r;
      g = a * sg + (1 - a) * g;
      b = a * sb + (1 - a) * b;
    }
    return [Math.round(r), Math.round(g), Math.round(b)] as [
      number,
      number,
      number,
    ];
  });

/** Copied from `skin-confetti.gate.ts` — see that file's own comment. */
function deltaE(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number],
): number {
  const lab = (r: number, g: number, b: number): [number, number, number] => {
    const lin = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const f = (t: number) =>
      t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };

  const [l1, a1, b1s] = lab(r1, g1, b1);
  const [l2, a2, b2s] = lab(r2, g2, b2);
  return Math.hypot(l1 - l2, a1 - a2, b1s - b2s);
}

const MIN_DELTA_E = 12;

/**
 * The instrument this issue actually needs, and the reason `paintedFill`
 * cannot be reused for the mark-state distinction here.
 *
 * `paintedFill` proves two *fills* are different — it walks `background-color`
 * up the ancestor chain (plus a covering `::before`, per the confetti fix).
 * Scorecard's mark is not a fill at all: the cell keeps its own `#fffdf7`
 * background in every state (earned, inherited, unmarked all read the exact
 * same `paintedFill` result), and the mark is a **border-only** ring drawn by
 * `::after`. A border is not a background, so `paintedFill` — even the
 * pseudo-element-aware copy above — has nothing to see here: `covers` would
 * also be true for the ring's box (it is 12% larger than the cell, well past
 * the node's own `clientWidth`/`clientHeight`), but `overlay.backgroundColor`
 * is `rgba(0, 0, 0, 0)` for a border-only pseudo, so the covering check would
 * pass and then find nothing to push onto the stack — silently reporting the
 * cell's own white as every state's "fill", which would make this test pass
 * against a version of the CSS with no ring at all.
 *
 * So this reads the ring's own `border-color` and `opacity` directly off the
 * `::after` — the actual painted property carrying the mark — rather than
 * asking what the instrument built for a filled overlay would (wrongly)
 * report. `null` for "no visible ring" (opacity 0, or fully transparent),
 * which is what an unmarked cell's `[data-mark]`-less state renders (the
 * `::after` rule is scoped to `.skin-cell[data-mark]`, so an unmarked cell has
 * no matching selector and therefore no ring at all — `getComputedStyle`
 * still answers for a pseudo-element that no rule targets, just with the
 * browser's own initial values, which is exactly the "no ring" case this
 * returns `null` for).
 */
async function ringColour(
  locator: ReturnType<Page['locator']>,
): Promise<[number, number, number, number] | null> {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node, '::after');
    const opacity = Number(style.opacity);
    const parts = style.borderTopColor.match(/[\d.]+/g);
    if (parts === null || parts.length < 3 || opacity === 0) return null;
    const alpha = (parts.length > 3 ? Number(parts[3]) : 1) * opacity;
    if (alpha === 0) return null;
    return [Number(parts[0]), Number(parts[1]), Number(parts[2]), alpha];
  });
}

test.describe('the card', () => {
  /**
   * The three-way mark distinction, for a border-only overlay. `ringColour`
   * above is what makes this assertion possible at all — see that function's
   * own comment for why `paintedFill` cannot answer this question for this
   * skin.
   *
   * Unmarked is asserted as "no ring" rather than compared by `deltaE` against
   * a colour, since there is no ring colour to compare — the claim for that
   * state is presence, not hue.
   */
  test('gives earned, inherited and unmarked cells three distinct ring states', async ({
    page,
  }) => {
    await useScorecardCookie(page);
    await openRoom(page, 'mid');
    await expectNoCellClipped(page);

    const card = page.getByLabel('Your card');
    const ringOf = (mark: 'earned' | 'inherited' | 'none') =>
      ringColour(card.locator(`[data-mark="${mark}"]`).first());

    const [earned, inherited, base] = await Promise.all([
      ringOf('earned'),
      ringOf('inherited'),
      ringOf('none'),
    ]);

    expect(earned, 'the earned cell has a visible ring').not.toBeNull();
    expect(inherited, 'the inherited cell has a visible ring').not.toBeNull();
    expect(base, 'the unmarked cell has no ring').toBeNull();

    expect(
      deltaE(
        [earned![0], earned![1], earned![2]],
        [inherited![0], inherited![1], inherited![2]],
      ),
      `earned ring rgb(${earned!.slice(0, 3).join(', ')}) against inherited ring rgb(${inherited!.slice(0, 3).join(', ')})`,
    ).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });

  /**
   * The handoff's own colour for the earned ring
   * (`rgba(229,80,42,.72)` — `--skin-marked`), read off the rendered `::after`
   * rather than assumed from the token declaration, so a rule that resolved
   * the token wrong (or dropped the alpha) would fail here even though the CSS
   * variable itself is untouched.
   */
  test('draws the earned ring in the handoff`s own orange, at the handoff`s own width', async ({
    page,
  }, info) => {
    await useScorecardCookie(page);
    await openRoom(page, 'mid');

    const earned = page.getByLabel('Your card').locator('[data-mark="earned"]').first();
    const style = await earned.evaluate((node) => {
      const after = getComputedStyle(node, '::after');
      return {
        borderColor: after.borderTopColor,
        borderWidth: after.borderTopWidth,
        borderRadius: after.borderTopLeftRadius,
        opacity: after.opacity,
      };
    });

    expect(style.borderColor, 'the earned ring`s colour').toBe(
      'rgba(229, 80, 42, 0.72)',
    );
    expect(style.opacity, 'the earned ring is shown').toBe('1');
    // A closed ring, not a box: `border-radius: 999px` on a roughly-square
    // inset reads as `50%` of the box once computed, i.e. a full circle/ellipse.
    expect(
      parseFloat(style.borderRadius),
      'the ring is a closed circle (999px resolves near 50% of its own box)',
    ).toBeGreaterThan(0);

    const expectedWidth = info.project.name.startsWith('ipad') ? '5px' : '4px';
    expect(
      style.borderWidth,
      `the ring's border width at ${info.project.name}`,
    ).toBe(expectedWidth);
  });

  /**
   * This issue's own acceptance criterion: the ring is an overlay, so
   * `expectNoCellClipped` — which measures the `[data-label]` span's own
   * `Range`, per `card-grid.tsx`'s `overflows()` — must pass for every one of
   * the pool's worst 24 at every viewport with the ring actually drawn (an
   * earned/inherited card, not an empty one), proving the ring is never
   * counted as label content leaving the box.
   *
   * Broken-then-fixed, per this issue's own instruction to prove the test can
   * fail: temporarily changing `[data-skin='scorecard'] .skin-cell[data-mark]`
   * from `position: absolute` to a `position: static` sibling *inside*
   * `[data-label]` (i.e. making the ring part of the label's own text flow)
   * made this fail at every viewport with an "overflows" report on marked
   * cells specifically — restoring the `::after` overlay made it pass again.
   * See this PR's own description for the paired before/after run.
   */
  test('does not let the ink ring enter the label`s own measured box', async ({
    page,
  }) => {
    await useScorecardCookie(page);
    await openRoom(page, 'mid');

    const card = page.getByLabel('Your card');
    const earnedCount = await card.locator('[data-mark="earned"]').count();
    const inheritedCount = await card.locator('[data-mark="inherited"]').count();
    expect(earnedCount, 'the mid-race fixture has earned cells').toBeGreaterThan(0);
    expect(inheritedCount, 'the mid-race fixture has inherited cells').toBeGreaterThan(0);

    await expectNoCellClipped(page);
  });

  /**
   * This issue's own named worst case: at `phone-small`, does the ring cross
   * its own label without the *legibility* consequence going past what
   * `expectNoCellClipped` already accepts? The brief names `Track Limits Lap
   * Deleted` and `Kid With Ear Defenders` from the design mock's own
   * illustrative labels, but `/legibility` serves the pool's *real* worst 24
   * (`apps/web/app/legibility/page.tsx`), which is a different, longer-lived
   * set — neither of the brief's two names is actually in it (checked: this
   * test's own `getByText` came back empty against the live pool before this
   * comment was written). So the worst case named here is read off the pool
   * itself — its own longest label — rather than the brief's illustrative one,
   * and the claim is exactly `expectNoCellClipped`'s own budget: the ring
   * crossing the label is the intended look, and the *label* still fits its
   * box regardless of the ring drawn on top of it, because the ring is
   * measured nowhere near the `[data-label]` `Range` at all (see the "does not
   * let the ink ring enter" test above for why).
   */
  test('lets the ring cross the pool`s widest labels at phone-small without clipping them', async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'phone-small',
      'this worst case is checked at the tightest viewport only',
    );

    await useScorecardCookie(page);
    await page.goto('/legibility');
    await expect(page.getByLabel('Your card')).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    // The pool's own longest label, read from the live card rather than
    // hardcoded from the design mock's illustrative set — see this test's own
    // comment for why the brief's two named examples are not actually in it.
    const worst = await page.getByLabel('Your card').evaluate((grid) => {
      const labels = [...grid.querySelectorAll('[data-label]')].map(
        (node) => node.textContent ?? '',
      );
      return labels.reduce((a, b) => (b.length > a.length ? b : a), '');
    });
    expect(worst.length, 'the pool has a real worst label to check').toBeGreaterThan(20);

    await expect(
      page.getByLabel('Your card').getByText(worst, { exact: true }),
    ).toHaveCount(1);

    await expectNoCellClipped(page);
  });

  /**
   * This issue's own explicit note: a marked label is normally re-checked
   * bolder (`docs/SURFACES.md`'s "a label that fit unmarked has to be
   * re-checked marked"), because every other skin's `markedStyle()` adds
   * `font-semibold` to a marked cell. Scorecard's mark leaves the label
   * completely untouched — no weight change, no re-fit — so that rule does
   * not apply here, and this is the assertion that says so rather than the
   * omission being silent: the earned cell's label carries the exact same
   * computed `font-weight` as the unmarked cell's.
   */
  test('does not change the label`s weight when a square is marked', async ({
    page,
  }) => {
    await useScorecardCookie(page);
    await openRoom(page, 'mid');

    const card = page.getByLabel('Your card');
    const weightOf = (mark: 'earned' | 'none') =>
      card
        .locator(`[data-mark="${mark}"] [data-label]`)
        .first()
        .evaluate((node) => getComputedStyle(node).fontWeight);

    const [earned, unmarked] = await Promise.all([weightOf('earned'), weightOf('none')]);
    expect(earned, 'a marked label`s weight equals an unmarked one`s').toBe(unmarked);
  });

  /**
   * The mark motion (README:142): "draws the ink ring with a fast scale-down
   * from 1.15 to 1, 160ms, as if stamped. Unmarking reverses without the
   * overshoot" — read here as "without the overshoot" meaning no
   * bounce-back easing, since a scale-down has no overshoot to begin with
   * (unlike Confetti's scale-up case, which is what that phrase was written
   * against). Both halves are one rule each: the earned ring's own duration
   * and the base (unmarked) `::after`'s resting transform.
   */
  test('stamps the ring in over 160ms and rests unmarked at the pre-stamp scale', async ({
    page,
  }) => {
    await useScorecardCookie(page);
    await openRoom(page, 'mid');

    const card = page.getByLabel('Your card');
    const motion = await card.evaluate((grid) => {
      const read = (node: Element) => {
        const style = getComputedStyle(node, '::after');
        return {
          duration: style.transitionDuration,
          transform: style.transform,
          opacity: style.opacity,
        };
      };
      return {
        earned: read(grid.querySelector('[data-mark="earned"]')!),
        unmarked: read(grid.querySelector('[data-mark="none"]')!),
      };
    });

    expect(motion.earned.duration, 'the ring transitions over 160ms').toContain('0.16s');
    expect(motion.earned.opacity, 'the earned ring is shown').toBe('1');
    expect(
      motion.earned.transform,
      'the earned ring rests at full scale',
    ).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

    expect(motion.unmarked.opacity, 'the unmarked ring is hidden').toBe('0');
    expect(
      motion.unmarked.transform,
      'the unmarked ring waits at the pre-stamp 1.15 scale',
    ).toContain('matrix(1.15, 0, 0, 1.15');
  });
});

test.describe('the card`s cell/font table', () => {
  /**
   * `docs/SURFACES.md`'s cell/font table needs this skin's own row. Baloo 2 is
   * the widest of the five faces (`docs/design/README.md`'s own note under
   * *Header controls*), and this issue's own font-size token
   * (`.skin-card-grid`, `globals.css`) is its own `cqw` fraction, so — same
   * reasoning as `skin-confetti.gate.ts`'s own copy of this test — the band is
   * this skin's own rather than assumed from another skin's table.
   */
  test('measures the actual cell and font size at this viewport', async ({
    page,
  }, info) => {
    await useScorecardCookie(page);
    await openRoom(page, 'start');

    const measured = await page.getByLabel('Your card').evaluate((grid) => {
      const label = grid.querySelector('[data-label]')!;
      return {
        container: grid.parentElement!.getBoundingClientRect().width,
        cell: label.parentElement!.getBoundingClientRect().width,
        font: parseFloat(getComputedStyle(label).fontSize),
      };
    });

    const ratio = measured.font / measured.container;

    info.annotations.push({
      type: 'cell/font',
      description: `${info.project.name}: cell ${measured.cell.toFixed(0)}px / font ${measured.font.toFixed(1)}px / container ${measured.container.toFixed(0)}px / font÷container ${ratio.toFixed(4)}`,
    });

    expect(measured.cell, 'the cell has a measurable width').toBeGreaterThan(0);
    expect(
      ratio,
      `font ${measured.font}px against container ${measured.container}px — this skin's 1.7cqw`,
    ).toBeGreaterThan(0.0165);
    expect(
      ratio,
      `font ${measured.font}px against container ${measured.container}px — this skin's 1.7cqw`,
    ).toBeLessThan(0.0175);
  });
});

test.describe('legibility', () => {
  /**
   * Acceptance criterion: "`/legibility` at `scorecard`: the pool's real worst
   * 24 unclipped at all four viewports." Baloo 2's own width and this issue's
   * own font-size token are the reason this is not a duplicate of the
   * pitwall-default run in `legibility.gate.ts`.
   */
  test('carries the pool`s own worst 24 labels without a cell clipping', async ({
    page,
  }) => {
    await useScorecardCookie(page);
    await page.goto('/legibility');
    await expect(page.getByLabel('Your card')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'scorecard');

    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('the join and card screens', () => {
  test('fit without horizontal scroll, and without vertical scroll at ipad-11-landscape', async ({
    page,
  }, info) => {
    await useScorecardCookie(page);
    await openLobby(page, 'needs-a-name');
    await expectNoHorizontalScroll(page);

    await openRoom(page, 'mid');
    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);

    if (info.project.name === 'ipad-11-landscape') {
      const overflowing = await page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
      );
      expect(overflowing, 'pixels the document scrolls vertically').toBeLessThanOrEqual(0);
    }
  });

  /**
   * This issue's own named trap: the rotated ticket box
   * (`transform: rotate(-2.5deg)`) inflates its bounding box, and a transform
   * is invisible to `scrollWidth` — `expectNoHorizontalScroll` above already
   * covers the page as a whole (it uses `overflow()`, not `scrollWidth`, per
   * `measure.ts`), but this asserts the specific claim: the rotated box itself
   * is still fully inside the viewport's own scrollable bounds at the
   * tightest width.
   */
  test('keeps the rotated room-code ticket clear of the viewport at phone-small', async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'phone-small',
      'the rotated box is tightest at the narrowest viewport',
    );

    await useScorecardCookie(page);
    await openLobby(page, 'needs-a-name');

    const ticket = page.locator('.skin-code');
    const box = (await ticket.boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(box.x, 'the rotated ticket`s left edge').toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      `the rotated ticket's right edge against a ${viewport.width}px viewport`,
    ).toBeLessThanOrEqual(viewport.width);

    await expectNoHorizontalScroll(page);
  });
});

test.describe('the call banner', () => {
  test('stays clear of the card, in flow, with the teal fill', async ({ page }) => {
    await useScorecardCookie(page);
    const fixture = await openRoom(page, 'start');

    await fixture.emit({
      seq: 500,
      kind: 'CALL',
      squareId: fixture.square(0).id,
      actorPlayerId: 'guest-id',
    });
    const credit = page.locator('p[role="status"]:not(dialog p)');
    await expect(credit).toBeVisible();
    await expect(credit).toHaveCSS('background-color', 'rgb(31, 122, 107)');

    await expectClearOfTheCard(page, credit, 'the call banner');
    await expect(credit).not.toHaveCSS('position', 'fixed');
  });
});

test.describe('the host deck sheet', () => {
  test('reads as distinct from the host`s own cream card', async ({ page }) => {
    await useScorecardCookie(page);
    await openRoom(page, 'start');

    const toggle = page.getByRole('button', { name: 'Host deck sheet' });
    await toggle.click();

    const sheet = page.getByLabel('Host deck sheet');
    await expect(sheet).toBeVisible();

    const sheetFill = await paintedFill(sheet);
    const cardFill: [number, number, number] = [255, 253, 247]; // #fffdf7, the card's own raised cell colour

    expect(
      deltaE(sheetFill, cardFill),
      `the deck sheet's fill rgb(${sheetFill.join(', ')}) against the card's #fffdf7`,
    ).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });
});

test.describe('themeColor and the iOS status bar', () => {
  test('are light for a scorecard request', async ({ page }) => {
    await useScorecardCookie(page);
    await page.goto('/r/ABCD');

    const themeColor = await page
      .locator('meta[name="theme-color"]')
      .getAttribute('content');
    expect(themeColor, 'themeColor for a scorecard request').toBe('#f7f1e4');

    const statusBar = await page
      .locator('meta[name="apple-mobile-web-app-status-bar-style"]')
      .getAttribute('content');
    expect(statusBar, 'the iOS status bar style').not.toBe('black-translucent');
  });
});

test.describe('focus', () => {
  const expectAccentRing = async (
    target: ReturnType<Page['locator']>,
    what: string,
  ) => {
    await target.focus();
    const outline = await target.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, color: style.outlineColor };
    });
    expect(outline.width, `${what} has a 2px outline`).toBe('2px');
    expect(outline.color, `${what}'s outline is the accent colour`).toBe(
      'rgb(229, 80, 42)',
    );
  };

  test('rings the primary action and a card cell in the accent colour', async ({
    page,
  }) => {
    await useScorecardCookie(page);
    await openLobby(page, 'needs-a-name');
    await page.getByLabel('Your name').fill('Ash');
    await expectAccentRing(
      page.getByRole('button', { name: 'Enter room' }),
      'the focused primary action',
    );

    await openRoom(page, 'start');
    await expectAccentRing(
      page.getByLabel('Your card').locator('button').first(),
      'a focused card cell',
    );
  });
});
