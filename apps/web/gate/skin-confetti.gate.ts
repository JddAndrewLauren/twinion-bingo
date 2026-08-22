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

/** Copied from `skin-pitwall.gate.ts` — see that file's own comment. */
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
   * This issue's own "Traps" section: a marked fill that bleeds past its
   * border can overlap its neighbour at a tight grid gap. Two adjacent earned
   * cells' painted boxes (the `::before` bleed, not the button's own content
   * box) must not overlap — measured geometrically rather than by eye, at
   * `phone-small`, the tightest of the four viewports.
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
     * The cell's own border box, expanded 1px on every side to stand in for
     * the `::before` bleed (`globals.css`'s `inset: -1px`) — `boundingBox()`
     * cannot target a pseudo-element directly, and the bleed is what the
     * "does not merge" claim is actually about.
     */
    const bledBoxes = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const box = await earnedCells.nth(index).boundingBox();
        if (box === null) return null;
        return { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 };
      }),
    );
    const boxes = bledBoxes.filter((box): box is NonNullable<typeof box> => box !== null);
    expect(boxes.length, 'every earned cell has a box').toBe(count);

    // Two adjacent cells' *painted* boxes (post-bleed) must not overlap at
    // all — a 0.5px slack for fractional layout, the same tolerance
    // `measure.ts` uses throughout.
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

        expect(
          overlapX > 0.5 && overlapY > 0.5,
          `two earned cells' boxes overlap: ${JSON.stringify(a)} / ${JSON.stringify(b)}`,
        ).toBe(false);
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
   * table. Reported per viewport rather than asserted against a fixed number:
   * the point is to paste what this run actually measured, the same
   * `sizes its type against the card` pattern `room.gate.ts` uses.
   */
  test('measures the actual cell and font size at this viewport', async ({
    page,
  }, info) => {
    await useConfettiCookie(page);
    await openRoom(page, 'start');

    const measured = await page.getByLabel('Your card').evaluate((grid) => {
      const label = grid.querySelector('[data-label]')!;

      return {
        cell: label.parentElement!.getBoundingClientRect().width,
        font: parseFloat(getComputedStyle(label).fontSize),
      };
    });

    info.annotations.push({
      type: 'cell/font',
      description: `${info.project.name}: cell ${measured.cell.toFixed(0)}px / font ${measured.font.toFixed(1)}px`,
    });

    expect(measured.cell).toBeGreaterThan(0);
    expect(measured.font).toBeGreaterThan(0);
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
