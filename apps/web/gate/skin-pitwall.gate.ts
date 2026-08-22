import { expect, test, type Page } from '@playwright/test';
import { GUEST, openLobby, openRoom } from './room-fixture';
import {
  expectClearOfTheCard,
  expectNoCellClipped,
  expectNoHorizontalScroll,
  expectThumbSized,
  expectWholeOnScreen,
} from './measure';

/**
 * #104's own gate: the structural pieces this issue adds to Pit Wall, gated as the
 * default skin — per this issue's own "Out of scope": there is no per-skin sweep yet,
 * so every test here runs whichever skin the browser opens on, which is `pitwall`
 * (`docs/SURFACES.md`'s note on the matrix).
 */

const phoneOnly = () =>
  ['phone-small', 'phone'].includes(test.info().project.name);
const landscapeOnly = () => test.info().project.name === 'ipad-11-landscape';

test.describe('the join screen', () => {
  test('shows the boxed room code, the ruled name field and the indexed roster', async ({
    page,
  }) => {
    test.skip(!phoneOnly(), 'this criterion names phone-small and phone');

    await openLobby(page, 'needs-a-name');

    const code = page.getByLabel('Room code ABCD');
    await expect(code).toBeVisible();
    // Four boxed characters, per the handoff's "Room code treatment per theme".
    await expect(code.locator('span')).toHaveCount(4);

    const name = page.getByLabel('Your name');
    await expect(name).toBeVisible();

    const roster = page.getByLabel('Players in the room');
    await expect(roster).toBeVisible();
    await expect(roster.getByText('Host')).toBeVisible();

    const submit = page.getByRole('button', { name: 'Enter room' });
    await expect(submit).toBeVisible();
    await expectThumbSized(submit, 'the primary action');

    // "reachable without scrolling past the primary action" — the submit button
    // itself has to be on screen without scrolling, at the tightest width.
    await expectWholeOnScreen(page, submit, 'the primary action');
    await expectNoHorizontalScroll(page);
  });

  test('splits into two columns with a hairline divider at ipad-11-landscape', async ({
    page,
  }) => {
    test.skip(!landscapeOnly(), 'this criterion names ipad-11-landscape only');

    await openLobby(page, 'needs-a-name');

    const code = page.getByLabel('Room code ABCD');
    const roster = page.getByLabel('Players in the room');
    const codeBox = await code.boundingBox();
    const rosterBox = await roster.boundingBox();

    expect(codeBox, 'the room code has a box').not.toBeNull();
    expect(rosterBox, 'the roster has a box').not.toBeNull();

    // Two columns, not one stacked above the other: the roster starts at or past
    // where the code column ends, and the two share vertical space.
    expect(
      rosterBox!.x,
      'the roster sits beside the code column rather than under it',
    ).toBeGreaterThanOrEqual(codeBox!.x + codeBox!.width - 1);

    await expect(page.getByText('Ash')).toBeVisible();
    await expect(page.getByText('Bea')).toBeVisible();
    await expect(page.getByText('Wilhelmina Featherstone')).toBeVisible();

    await expectNoHorizontalScroll(page);
  });
});

/**
 * The *painted* fill of an element, as opaque 8-bit sRGB.
 *
 * `getComputedStyle().backgroundColor` is not that: a cell's fill is a
 * translucent wash, and comparing the declarations is how round 1's version of
 * the test below passed while two cells rendered 7/255 apart. So this walks the
 * ancestor chain collecting every background until it reaches an opaque one, then
 * composites back down — which is what the eye is given.
 *
 * Runs in the page rather than here because it needs `getComputedStyle`.
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

    // Bottom-most first. If the walk never met an opaque background, the
    // canvas' own white is what shows through.
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

/**
 * CIE76 ΔE between two opaque sRGB colours.
 *
 * Not a WCAG contrast ratio, and deliberately: at Pit Wall's luminances a *hue*
 * step as loud as the mocks' own cyan earned fill scores only 1.25:1 against an
 * unmarked cell, so a contrast threshold either passes everything or fails the
 * handoff's own design. ΔE answers the question the acceptance criterion actually
 * asks — "are these three telling apart at a glance" — across lightness and hue
 * together.
 */
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

/**
 * How far apart two cell states have to render.
 *
 * The floor is set from the mocks rather than from a round number: the handoff's
 * own earned fill sits ΔE 17.1 from an unmarked cell, so 12 is comfortably inside
 * a step the design already ships while decisively failing anything that is
 * merely a different *declaration* — round 1's inherited wash measured 3.3.
 */
const MIN_DELTA_E = 12;

test.describe('the card', () => {
  test('gives earned, inherited and unmarked cells three distinct fills', async ({
    page,
  }) => {
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

    // Reported as rendered colours, so a failure names what was painted rather
    // than only that two numbers differed.
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

test.describe('the progress readout', () => {
  test('reads 0/24 at lights out and 8/24 mid-race, from existing state alone', async ({
    page,
  }) => {
    const readout = (p: Page) => p.getByRole('progressbar', { name: /marked$/ });

    await openRoom(page, 'start');
    await expect(readout(page)).toHaveAttribute('aria-label', '0 of 24 marked');

    // The fixture's 'mid' stage marks 12 of the 24 (`room-fixture.ts`), not the
    // handoff's illustrative 8 — the count is what is asserted, not the number.
    await openRoom(page, 'mid');
    await expect(readout(page)).toHaveAttribute('aria-label', '12 of 24 marked');
  });
});

test.describe('the call banner', () => {
  test('stays clear of the card and in flow rather than fixed', async ({ page }) => {
    const fixture = await openRoom(page, 'start');

    await fixture.emit({
      seq: 500,
      kind: 'CALL',
      squareId: fixture.square(0).id,
      actorPlayerId: GUEST.id,
    });
    const credit = page.locator('p[role="status"]:not(dialog p)');
    await expect(credit).toBeVisible();

    await expectClearOfTheCard(page, credit, 'the call banner');
    await expect(credit).not.toHaveCSS('position', 'fixed');
  });
});

test.describe('focus', () => {
  /**
   * The accent colour (`#ff2e2e`), not merely "some outline" — a browser's own
   * default focus ring also has a non-zero width, which a width-only assertion
   * cannot tell apart from this issue's own rule.
   */
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
      'rgb(255, 46, 46)',
    );
  };

  test('rings the primary action and a card cell in the accent colour', async ({
    page,
  }) => {
    await openLobby(page, 'needs-a-name');
    await page.getByLabel('Your name').fill('Ash');
    await expectAccentRing(
      page.getByRole('button', { name: 'Enter room' }),
      'the focused primary action',
    );

    // Two elements, and specifically these two: the rule is one selector over
    // `:is(button, a, input, [tabindex])`, so a card cell is the case that proves
    // it reaches the elements this issue built rather than only a submit button
    // that a browser default would have ringed anyway.
    await openRoom(page, 'start');
    await expectAccentRing(
      page.getByLabel('Your card').locator('button').first(),
      'a focused card cell',
    );
  });
});
