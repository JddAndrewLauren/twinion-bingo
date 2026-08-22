import { expect, test, type Page } from '@playwright/test';
import { openLobby, openRoom } from './room-fixture';
import {
  expectClearOfTheCard,
  expectNoCellClipped,
  expectNoHorizontalScroll,
} from './measure';

/**
 * #106's own gate: Confetti — the app's first light surface — sat against the
 * same instruments `skin-pitwall.gate.ts` (#104) built rather than a second
 * set of them. `paintedFill`/`deltaE`/`MIN_DELTA_E` below are that file's
 * technique, copied rather than imported: neither is exported, and this issue's
 * brief is to reuse the *instrument*, not to refactor a shared module out of a
 * different issue's file.
 *
 * Every test here puts the browser on Confetti itself first, since it is not
 * the default skin (`pitwall`'s own gate runs on whichever skin a fresh
 * `page.goto` opens on). One way, used everywhere: a cookie set on the
 * context *before* `openLobby`/`openRoom`'s own `page.goto`, which
 * `apps/web/app/current-skin.ts` reads server-side, so `<html data-skin>`,
 * `themeColor` and the Apple status bar style are all right from the very
 * first response — a `<meta>` tag cannot be fixed retroactively by a
 * client-side skin change, so a cookie is the one technique that covers every
 * assertion in this file rather than only most of them.
 *
 * (Pressing the Theme button twice, matching `room.gate.ts`'s own
 * `pitwall → slipstream → confetti` cycling, was tried first and dropped: a
 * test that reaches Confetti this way and then calls `openRoom`/`openLobby`
 * again mid-test re-navigates, and the cookie the button also writes survives
 * that reload — so a *second* two-press cycle lands on `scorecard` and
 * `pitwall` instead of stopping at `confetti`. The cookie is set once, up
 * front, and every navigation in the test simply keeps it.)
 */

const SKIN_COOKIE = 'twinion_bingo_skin';

async function useConfettiCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: SKIN_COOKIE,
      value: 'confetti',
      url: 'http://127.0.0.1:3210',
    },
  ]);
}

/**
 * Copied from `skin-pitwall.gate.ts` — see that file's own comment — and then
 * taught one thing that copy does not know: **an overlay layer painted by a
 * pseudo-element counts as the surface.**
 *
 * The handoff renders Confetti's marked cell as an absolutely positioned
 * overlay at `inset: -2px` (HTML:674 phone, HTML:341 iPad), and
 * `getComputedStyle(node).backgroundColor` cannot see a `::before`'s
 * declaration at all — so the unmodified instrument would walk straight past
 * the green and report the white cell underneath it. `getComputedStyle` takes a
 * pseudo-element argument, so the fix belongs here rather than in the CSS: the
 * design keeps the rendering the handoff drew, and the test follows it.
 *
 * The layer is pushed as the topmost entry of the same compositing stack, with
 * its alpha scaled by its own `opacity` — which is also what makes the
 * mark-motion rule safe to read, since an unmarked cell's overlay is present in
 * the DOM at `opacity: 0` and correctly contributes nothing.
 *
 * Deliberately *not* lifted into `gate/measure.ts`: `paintedFill` is currently
 * duplicated across `skin-pitwall.gate.ts`, `skin-slipstream.gate.ts` (#105)
 * and this file, and #105 is in review concurrently — a shared module is a
 * FINAL-GATE consolidation, not a change to make from inside one slice.
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
      const layer = parse(overlay.backgroundColor);
      const shown = Number(overlay.opacity);
      if (layer !== null && layer[3] * shown > 0) {
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

/** Copied from `skin-pitwall.gate.ts` — see that file's own comment. */
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
 * The blue card header is a surface *this* slice invented, so its legibility is
 * this slice's to hold — and holding it needs an instrument the deltaE pair
 * above cannot provide: deltaE says two fills look different, not that ink is
 * readable on a ground.
 *
 * `composite` flattens a possibly-translucent `color`/`outline-color` (the
 * handoff's own header text is white at `.85`/`.9`) onto the surface
 * `paintedFill` reports underneath it; `contrastRatio` is the ordinary WCAG
 * relative-luminance ratio. Together they assert the *composited* result rather
 * than the declared token, which is the only form of the claim that catches the
 * real defect here — a child re-setting its colour from the light skin's
 * near-black tokens on top of a blue ground.
 */
function parseColour(value: string): [number, number, number, number] {
  const parts = value.match(/[\d.]+/g);
  expect(parts, `parseable colour: ${value}`).not.toBeNull();
  const [r, g, b, a] = parts!;
  return [Number(r), Number(g), Number(b), a === undefined ? 1 : Number(a)];
}

function composite(
  value: string,
  base: [number, number, number],
): [number, number, number] {
  const [r, g, b, a] = parseColour(value);
  return [
    a * r + (1 - a) * base[0],
    a * g + (1 - a) * base[1],
    a * b + (1 - a) * base[2],
  ];
}

function contrastRatio(
  one: [number, number, number],
  other: [number, number, number],
): number {
  const luminance = ([r, g, b]: [number, number, number]) => {
    const lin = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };

  const [lighter, darker] = [luminance(one), luminance(other)].sort(
    (a, b) => b - a,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

/**
 * The handoff's own value for the header's run status is white at `.85` (phone,
 * HTML:664) / `.9` (iPad, HTML:317), which composites to 3.83:1 / 4.06:1 on
 * `#2f6bff`. The floor is set just under the phone number so both viewports
 * clear it and the light skin's `--skin-muted` (2.04:1 on blue) does not.
 */
const MIN_HEADER_TEXT_CONTRAST = 3.5;

/**
 * A focus ring has to be *seen*, so it is held against the ground it is drawn
 * on rather than against the control it rings. On the blue header white is
 * 4.50:1; the skin's `#ff5c39` accent — correct on the cream surfaces, where
 * this file's `focus` suite reports it — is 1.47:1 here, i.e. no indicator.
 */
const MIN_RING_CONTRAST = 3;

test.describe('the card', () => {
  test('gives earned, inherited and unmarked cells three distinct fills against a white cell', async ({
    page,
  }) => {
    await useConfettiCookie(page);
    await openRoom(page, 'mid');
    await expectNoCellClipped(page);

    const card = page.getByLabel('Your card');
    const fillOf = (mark: 'earned' | 'inherited' | 'none') =>
      paintedFill(card.locator(`[data-mark="${mark}"]`).first());

    const [earned, inherited, base] = await Promise.all([
      fillOf('earned'),
      fillOf('inherited'),
      fillOf('none'),
    ]);

    const pairs: [string, [number, number, number], [number, number, number]][] =
      [
        ['earned vs inherited', earned, inherited],
        ['earned vs unmarked', earned, base],
        ['inherited vs unmarked', inherited, base],
      ];

    for (const [what, one, other] of pairs) {
      expect(
        deltaE(one, other),
        `${what}: rgb(${one.join(', ')}) against rgb(${other.join(', ')})`,
      ).toBeGreaterThanOrEqual(MIN_DELTA_E);
    }
  });

  /**
   * The handoff's mark motion (README:142): "scales the fill from 0.85 to 1
   * with a slight overshoot (`cubic-bezier(.34,1.56,.64,1)`, 220ms) ...
   * Unmarking reverses without the overshoot."
   *
   * Asserted on the overlay, because the overlay is what made it expressible —
   * a `background-color` cannot be scaled, which is exactly how this animation
   * went missing once before. The two halves are one rule each: the earned
   * state's own timing function is the overshoot, and the base state's is a
   * plain `ease-out`, since a transition takes its curve from the state it is
   * going *to*.
   */
  test('scales the earned overlay in with the handoff`s overshoot, and out without it', async ({
    page,
  }) => {
    await useConfettiCookie(page);
    await openRoom(page, 'mid');

    const card = page.getByLabel('Your card');
    const motion = await card.evaluate((grid) => {
      const read = (node: Element) => {
        const style = getComputedStyle(node, '::before');
        return {
          duration: style.transitionDuration,
          easing: style.transitionTimingFunction,
          transform: style.transform,
          opacity: style.opacity,
        };
      };

      return {
        earned: read(grid.querySelector('[data-mark="earned"]')!),
        unmarked: read(grid.querySelector('[data-mark="none"]')!),
      };
    });

    expect(motion.earned.duration, 'the earned overlay transitions over 220ms').toContain(
      '0.22s',
    );
    expect(
      motion.earned.easing,
      'the earned overlay scales in with the overshoot curve',
    ).toContain('cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(motion.earned.opacity, 'the earned overlay is shown').toBe('1');
    expect(
      motion.earned.transform,
      'the earned overlay rests at full scale',
    ).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

    expect(
      motion.unmarked.easing,
      'unmarking reverses without the overshoot',
    ).not.toContain('cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(
      motion.unmarked.transform,
      'the unmarked overlay waits at 0.85',
    ).toContain('matrix(0.85, 0, 0, 0.85');
  });

  /**
   * This issue's own "Traps" section: a marked fill that bleeds past its
   * border can overlap its neighbour at a tight grid gap. Two adjacent earned
   * cells' painted boxes — the `::before` overlay's box at `inset: -2px`, not
   * the button's own border box — must stay **positively clear** of each other,
   * measured geometrically rather than by eye, at `phone-small`, the tightest
   * of the four viewports.
   *
   * Clearance, not absence-of-overlap. "The fills do not overlap" is satisfied
   * by two fills that touch at exactly 0px, which is the merged-block state
   * this trap is about — so the assertion is a positive floor on the gap
   * between the painted boxes instead. At the handoff's 5px grid gap and 2px
   * bleed the real clearance is 1px, and this fails at anything that closes it.
   */
  test('does not merge two adjacent bled marked cells at phone-small', async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'phone-small',
      'this trap is checked at the tightest viewport only',
    );

    await useConfettiCookie(page);
    await openRoom(page, 'mid');

    const card = page.getByLabel('Your card');
    const earnedCells = card.locator('[data-mark="earned"]');
    const count = await earnedCells.count();
    expect(count, 'the mid-race fixture has earned cells').toBeGreaterThan(1);

    /**
     * The bleed is read out of the overlay itself rather than hardcoded, so
     * this test measures whatever `globals.css` actually ships: `boundingBox()`
     * cannot target a pseudo-element, but its `inset` is a computed style like
     * any other, and the overlay's own box is the cell's border box grown by
     * that amount on all four sides.
     */
    const bleed = await earnedCells
      .first()
      .evaluate((cell) =>
        Math.abs(parseFloat(getComputedStyle(cell, '::before').top)),
      );
    expect(bleed, "the earned overlay's bleed past the border").toBeGreaterThan(0);

    const bledBoxes = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const box = await earnedCells.nth(index).boundingBox();
        if (box === null) return null;
        return {
          x: box.x - bleed,
          y: box.y - bleed,
          width: box.width + bleed * 2,
          height: box.height + bleed * 2,
        };
      }),
    );
    const boxes = bledBoxes.filter((box): box is NonNullable<typeof box> => box !== null);
    expect(boxes.length, 'every earned cell has a box').toBe(count);

    /**
     * Every pair of earned cells' *painted* boxes has to be separated on at
     * least one axis by a real, positive gap. Row-neighbours overlap fully on
     * the vertical axis and must clear horizontally; column-neighbours the
     * other way round; diagonal neighbours clear on both. `0.5px` is the same
     * fractional-layout tolerance `measure.ts` uses, applied here as the floor
     * the clearance must *exceed* rather than as slack on an overlap.
     */
    const MIN_CLEARANCE = 0.5;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const clearX = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
        const clearY = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);

        expect(
          Math.max(clearX, clearY),
          `clearance between two earned cells' painted boxes (bleed ${bleed}px): ${JSON.stringify(a)} / ${JSON.stringify(b)}`,
        ).toBeGreaterThanOrEqual(MIN_CLEARANCE);
      }
    }
  });
});

test.describe('the card`s cell/font table', () => {
  /**
   * `docs/SURFACES.md`'s cell/font table needs this skin's own row — Fredoka is
   * a materially wider face than Pit Wall's Roboto Condensed, and this issue's
   * own font-size token (`.skin-card-grid`, `globals.css`) is a different
   * `cqw` fraction, so the numbers are not assumed to carry over from #104's
   * table. The per-viewport numbers are still reported — that is what the
   * table is for — but the *claim* is the container-query invariant, exactly as
   * `room.gate.ts`'s `sizes its type against the card` asserts it: `font /
   * container` inside a narrow band.
   *
   * The band is this skin's own. `room.gate.ts` holds the shared `3cqw` at
   * `(0.028, 0.032)`; Confetti's `.skin-card-grid` token is `2.6cqw`, so the
   * ratio is 0.026 and the band is `(0.0255, 0.0265)`. That fails on a
   * reversion to the shared `3cqw`, on any viewport-based (`px`/`rem`) size,
   * and on a size that stops resolving against the `@container` ancestor —
   * which is the whole point of `card-grid.tsx`'s own note about `cqw` falling
   * silently back to the viewport. The denominator is the container itself
   * (`card-grid.tsx:375`'s `@container` div), not the cell, because that is
   * what `cqw` resolves against.
   */
  test('measures the actual cell and font size at this viewport', async ({
    page,
  }, info) => {
    await useConfettiCookie(page);
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
      `font ${measured.font}px against container ${measured.container}px — this skin's 2.6cqw`,
    ).toBeGreaterThan(0.0255);
    expect(
      ratio,
      `font ${measured.font}px against container ${measured.container}px — this skin's 2.6cqw`,
    ).toBeLessThan(0.0265);
  });
});

test.describe('legibility', () => {
  /**
   * Acceptance criterion: "`/legibility` at `confetti`: the pool's real worst
   * 24 unclipped at all four viewports." Mixed case and Fredoka's own metrics
   * are this issue's own "Traps" — a wide face, and mixed case changes the
   * measurements the `#47` table was built against — so this is not a
   * duplicate of `legibility.gate.ts`'s pitwall-default run.
   */
  test('carries the pool`s own worst 24 labels without a cell clipping', async ({
    page,
  }) => {
    await useConfettiCookie(page);
    await page.goto('/legibility');
    await expect(page.getByLabel('Your card')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'confetti');

    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('the die', () => {
  test('is visible on both the cream join surface and the blue card surface', async ({
    page,
  }) => {
    await useConfettiCookie(page);
    await openLobby(page, 'needs-a-name');
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'confetti');

    const joinDie = page.locator('svg[data-die-surface="join"]');
    await expect(joinDie).toHaveCSS('color', 'rgba(32, 24, 15, 0.55)');

    await openRoom(page, 'start');
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'confetti');

    const cardHeader = page.locator('header.skin-card-header');
    await expect(cardHeader).toHaveCSS('background-color', 'rgb(47, 107, 255)');

    const cardDie = page.locator('svg[data-die-surface="card"]');
    await expect(cardDie).toHaveCSS('color', 'rgba(255, 255, 255, 0.85)');
  });
});

test.describe('the blue card header', () => {
  /**
   * The slice that paints a ground owns the legibility of everything standing
   * on it. Nothing in this gate saw that before: the die test above asserts the
   * header's `background-color` and the die's `color` and stops, so a stats line
   * still taking its colour from the light skin's `--skin-muted` (2.04:1 on
   * blue), a Theme button still at `text-ink` with an invisible `border-rule`,
   * and a focus ring still at `--skin-accent` (1.47:1 on blue) all passed.
   *
   * Every assertion here is against the *composited* colour on the surface
   * `paintedFill` reports, at every viewport rather than one — the muted token
   * is per-breakpoint (`.85` phone / `.9` iPad), so a rule that only lands on
   * one of the two is a real failure.
   */
  test('keeps its run status, Theme button and focus ring legible on the blue ground', async ({
    page,
  }) => {
    await useConfettiCookie(page);
    await openRoom(page, 'mid');

    const header = page.locator('header.skin-card-header');
    await expect(header).toHaveCSS('background-color', 'rgb(47, 107, 255)');
    const ground = await paintedFill(header);

    const status = header.locator('p');
    const statusColour = await status.evaluate(
      (node) => getComputedStyle(node).color,
    );
    expect(
      contrastRatio(composite(statusColour, ground), ground),
      `the run status (${statusColour}) on the header's rgb(${ground.join(', ')})`,
    ).toBeGreaterThanOrEqual(MIN_HEADER_TEXT_CONTRAST);

    // The Theme button is the handoff's yellow pill, so it carries its own
    // ground: its ink is held against its own painted fill, not the header's.
    const themeButton = header.getByRole('button', { name: 'Theme' });
    const pill = await paintedFill(themeButton);
    const pillColour = await themeButton.evaluate(
      (node) => getComputedStyle(node).color,
    );
    expect(
      contrastRatio(composite(pillColour, pill), pill),
      `the Theme button's ink (${pillColour}) on its own fill rgb(${pill.join(', ')})`,
    ).toBeGreaterThanOrEqual(4.5);

    // The ring is drawn at `outline-offset: 2px`, i.e. outside the pill and on
    // the header's own blue, so the header's ground is what it must read on.
    await themeButton.focus();
    const ring = await themeButton.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, colour: style.outlineColor };
    });
    expect(ring.width, "the header control's outline width").toBe('2px');
    expect(
      contrastRatio(composite(ring.colour, ground), ground),
      `the focus ring (${ring.colour}) on the header's rgb(${ground.join(', ')})`,
    ).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
  });
});

test.describe('the join and card screens', () => {
  test('fit without horizontal scroll, and without vertical scroll at ipad-11-landscape', async ({
    page,
  }, info) => {
    await useConfettiCookie(page);
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
});

test.describe('the call banner', () => {
  test('stays clear of the card, in flow, with the yellow fill', async ({ page }) => {
    await useConfettiCookie(page);
    const fixture = await openRoom(page, 'start');

    await fixture.emit({
      seq: 500,
      kind: 'CALL',
      squareId: fixture.square(0).id,
      actorPlayerId: 'guest-id',
    });
    const credit = page.locator('p[role="status"]:not(dialog p)');
    await expect(credit).toBeVisible();
    await expect(credit).toHaveCSS('background-color', 'rgb(255, 210, 63)');

    await expectClearOfTheCard(page, credit, 'the call banner');
    await expect(credit).not.toHaveCSS('position', 'fixed');
  });
});

test.describe('the host deck sheet', () => {
  test('reads as distinct from the host`s own white card', async ({ page }) => {
    await useConfettiCookie(page);
    await openRoom(page, 'start');

    const toggle = page.getByRole('button', { name: 'Host deck sheet' });
    await toggle.click();

    const sheet = page.getByLabel('Host deck sheet');
    await expect(sheet).toBeVisible();

    const sheetFill = await paintedFill(sheet);
    const cardFill: [number, number, number] = [255, 255, 255]; // the card's own raised white

    expect(
      deltaE(sheetFill, cardFill),
      `the deck sheet's fill rgb(${sheetFill.join(', ')}) against the card's white`,
    ).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });
});

test.describe('themeColor and the iOS status bar', () => {
  test('are light for a confetti request', async ({ page }) => {
    await useConfettiCookie(page);
    await page.goto('/r/ABCD');

    const themeColor = await page
      .locator('meta[name="theme-color"]')
      .getAttribute('content');
    expect(themeColor, 'themeColor for a confetti request').toBe('#fffbf2');

    const statusBar = await page
      .locator('meta[name="apple-mobile-web-app-status-bar-style"]')
      .getAttribute('content');
    expect(statusBar, 'the iOS status bar style').toBe('default');
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
      'rgb(255, 92, 57)',
    );
  };

  test('rings the primary action and a card cell in the accent colour', async ({
    page,
  }) => {
    await useConfettiCookie(page);
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
