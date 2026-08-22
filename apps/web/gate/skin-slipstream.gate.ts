import { expect, test, type Page } from '@playwright/test';
import { SKIN_COOKIE } from '../app/skin';
import { GUEST, openLobby, openRoom } from './room-fixture';
import {
  expectNoCellClipped,
  expectNoHorizontalScroll,
  expectNoVerticalScroll,
  expectThumbSized,
} from './measure';

/**
 * #105's own gate: Slipstream, the speed-and-scale skin — sheared italic
 * display type, a diagonal line field, marked squares as solid yellow blocks.
 *
 * Every test here has to put the browser on `slipstream` *before* the app's
 * first paint, the same way `skin-button.tsx`'s own cookie does: `layout.tsx`
 * reads `twinion_bingo_skin` server-side to put `data-skin` on `<html>` for the
 * very first render, so a cookie set after `page.goto` would be a page late.
 * `openRoom`/`openLobby` (`room-fixture.ts`) are skin-agnostic — every earlier
 * skin's own gate has run them at whatever `data-skin` the browser already had
 * — so this file sets the cookie itself rather than adding a skin parameter
 * those fixtures do not need for anyone else.
 */
async function setSlipstream(page: Page): Promise<void> {
  // `127.0.0.1`, matching `playwright.config.ts`'s own `baseURL` host — the
  // domain a cookie set before the first `page.goto` has to be scoped to.
  await page.context().addCookies([
    {
      name: SKIN_COOKIE,
      value: 'slipstream',
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
}

const phoneOnly = () =>
  ['phone-small', 'phone'].includes(test.info().project.name);
const landscapeOnly = () => test.info().project.name === 'ipad-11-landscape';

test.describe('the join screen', () => {
  test('renders the room code as one continuous, selectable word', async ({
    page,
  }) => {
    await setSlipstream(page);
    await openLobby(page, 'needs-a-name');
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'slipstream');

    // Real text, not an image: the accessible name carries the code and the
    // painted characters are still there to select — `textContent` reads
    // through `background-clip: text`, which only ever affects paint.
    const code = page.getByLabel('Room code ABCD');
    await expect(code).toBeVisible();
    expect(await code.textContent()).toBe('ABCD');

    await expectNoHorizontalScroll(page);
  });

  test('renders the room code without overflowing its container at phone-small', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'phone-small', 'names phone-small only');
    await setSlipstream(page);
    await openLobby(page, 'needs-a-name');

    const code = page.getByLabel('Room code ABCD');
    const box = await code.boundingBox();
    const viewport = page.viewportSize();

    expect(box, 'the room code has a box').not.toBeNull();
    expect(viewport, 'the page has a viewport').not.toBeNull();
    expect(
      box!.x + box!.width,
      'the room code stays inside a 375px viewport',
    ).toBeLessThanOrEqual(viewport!.width + 0.5);

    await expectNoHorizontalScroll(page);
  });

  test('truncates the roster to four names plus a chip at phone, and shows every name at ipad-11-landscape', async ({
    page,
  }) => {
    await setSlipstream(page);
    await openLobby(page, 'needs-a-name');

    const roster = page.getByLabel('Players in the room');
    await expect(roster).toBeVisible();

    // The fixture's roster (`room-fixture.ts`) holds six players: Ash, Bea,
    // Wilhelmina Featherstone, Cal, Dev, Eve.
    if (phoneOnly() || test.info().project.name === 'ipad-11-portrait') {
      await expect(roster.getByText('Ash')).toBeVisible();
      await expect(roster.getByText('Bea')).toBeVisible();
      await expect(roster.getByText('Cal', { exact: true })).toBeVisible();
      await expect(roster.getByText('Wilhelmina Featherstone')).toBeVisible();
      await expect(roster.getByText('Dev', { exact: true })).toBeHidden();
      await expect(roster.getByText('Eve', { exact: true })).toBeHidden();
      await expect(roster.getByText('+2')).toBeVisible();
    } else {
      await expect(roster.getByText('Dev', { exact: true })).toBeVisible();
      await expect(roster.getByText('Eve', { exact: true })).toBeVisible();
      await expect(roster.getByText('+2')).toBeHidden();
    }

    await expectNoHorizontalScroll(page);
  });

  test('gives the primary action a 44x44 hit element on its unsheared expander', async ({
    page,
  }) => {
    await setSlipstream(page);
    await openLobby(page, 'needs-a-name');
    await page.getByLabel('Your name').fill('Ash');

    const submit = page.getByRole('button', { name: 'Enter room' });
    await expect(submit).toBeVisible();

    // The button carries no `[data-hit-expand]` span of its own (unlike the
    // Theme button and the die): its whole rendered box is already the hit
    // target, per `ACTION_BUTTON`'s `min-h-11`, so the 44px floor is measured
    // on the button itself.
    await expectThumbSized(submit, 'the primary action');

    // The criterion is *where the shear lives*, and a bounding-box measurement
    // cannot see that: `skewX` leaves a box's height unchanged and only widens
    // it, so a skew migrating onto the button would make a `>= 44` assertion
    // *more* likely to pass, not less. Assert the computed transform directly,
    // as a pair — the button flat, the inner fill actually sheared — so moving
    // `skewX(-8deg)` from `.skin-action-primary-fill` up to
    // `.skin-action-primary` fails on the first half and deleting the shear
    // altogether fails on the second.
    await expect(submit).toHaveCSS('transform', 'none');
    const fill = submit.locator('.skin-action-primary-fill');
    await expect(fill).not.toHaveCSS('transform', 'none');
  });

  test('gives the Theme button a 44x44 hit element on its unsheared expander', async ({
    page,
  }) => {
    await setSlipstream(page);
    await openLobby(page, 'needs-a-name');

    const theme = page.getByRole('button', { name: 'Theme' });
    await expectThumbSized(theme.locator('[data-hit-expand]'), "the Theme button's hit element");

    // The criterion is that the hit area is measured on an *unsheared*
    // expander, and no bounding-box measurement can establish that: `skewX`
    // leaves height untouched and only widens the box, so a migrated skew
    // makes a `>= 44` floor easier to clear, not harder. Assert the computed
    // transform as a pair instead — the button and its expander flat, the fill
    // genuinely sheared. `[data-hit-expand]` is a sibling of `.skin-theme-fill`
    // rather than a descendant, so this pair is exactly what fails if the skew
    // is moved from the fill onto `.skin-theme` (which would skew the expander
    // with it, since the expander is a positioned descendant of the button).
    await expect(theme).toHaveCSS('transform', 'none');
    await expect(theme.locator('[data-hit-expand]')).toHaveCSS('transform', 'none');
    await expect(theme.locator('.skin-theme-fill')).not.toHaveCSS('transform', 'none');
  });
});

/**
 * The *painted* fill of an element, as opaque 8-bit sRGB — the same instrument
 * `gate/skin-pitwall.gate.ts` introduced, reused rather than reimplemented per
 * this issue's own brief.
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

/** CIE76 ΔE between two opaque sRGB colours — `skin-pitwall.gate.ts`'s own. */
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

/** Same floor `skin-pitwall.gate.ts` set, from the mocks' own earned/unmarked step. */
const MIN_DELTA_E = 12;

test.describe('the card', () => {
  test('carries the pool without a cell clipping, at every viewport', async ({
    page,
  }, info) => {
    await setSlipstream(page);
    await openRoom(page, 'start');

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);

    info.annotations.push({
      type: 'card',
      description: await page.getByLabel('Your card').evaluate((grid) => {
        const label = grid.querySelector('[data-label]')!;
        const cell = label.parentElement!.getBoundingClientRect().width;

        return `cell ${cell.toFixed(0)}px / font ${parseFloat(getComputedStyle(label).fontSize).toFixed(1)}px`;
      }),
    });
  });

  test('carries it marked too, earned and inherited', async ({ page }) => {
    await setSlipstream(page);
    await openRoom(page, 'mid');

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);
  });

  test('gives earned, inherited and unmarked cells three distinct fills', async ({
    page,
  }) => {
    await setSlipstream(page);
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
});

test.describe('the join and card screens', () => {
  test('render with no horizontal scroll, and no vertical scroll at ipad-11-landscape', async ({
    page,
  }) => {
    await setSlipstream(page);
    await openLobby(page, 'needs-a-name');
    await expectNoHorizontalScroll(page);
    if (landscapeOnly()) await expectNoVerticalScroll(page, 'the join screen');

    await setSlipstream(page);
    await openRoom(page, 'mid');
    await expectNoHorizontalScroll(page);
    if (landscapeOnly()) await expectNoVerticalScroll(page, 'the card screen');
  });
});

test.describe('the committed pool on a card, at slipstream', () => {
  /**
   * `legibility.gate.ts`'s own claim, re-run under this skin: the pool's real
   * worst 24 labels, unclipped, but now under Archivo 900 at this skin's own
   * label-size token rather than Roboto Condensed at the shared `3cqw`.
   */
  test('carries its own worst 24 labels without a cell clipping', async ({
    page,
  }) => {
    await setSlipstream(page);
    await page.goto('/legibility');
    await expect(page.getByLabel('Your card')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'slipstream');

    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('the call banner', () => {
  test('stays in flow and clear of nothing it should not cover', async ({
    page,
  }) => {
    await setSlipstream(page);
    const fixture = await openRoom(page, 'start');

    await fixture.emit({
      seq: 500,
      kind: 'CALL',
      squareId: fixture.square(0).id,
      actorPlayerId: GUEST.id,
    });
    const credit = page.locator('p[role="status"]:not(dialog p)');
    await expect(credit).toBeVisible();
    await expect(credit).not.toHaveCSS('position', 'fixed');
  });
});
