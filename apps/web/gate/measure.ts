import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The measurements the gate makes, and why they are these ones.
 *
 * `docs/SURFACES.md` records that this project has measured the card wrong three
 * separate times, so the instruments matter more than the assertions built on them.
 * Every function here is written against a specific way an earlier run lied.
 */

/**
 * Does an element's *rendered* text leave its own content box?
 *
 * A `Range` over the painted line boxes, compared against the box minus its border
 * and padding — **not** `scrollWidth`, which `docs/SURFACES.md` prescribes and which
 * hid #47 through #8's run, #10's run and #11's first run. Two independent reasons it
 * cannot be used here:
 *
 * 1. A cell is a `justify-center` flex container, and content overflowing a centred
 *    flex line is not counted in `scrollWidth` at all.
 * 2. `scrollWidth` is a layout measurement and cannot see a transform, so anything
 *    squeezed to fit still reads as overflowing.
 *
 * Returns how far past each edge the text runs, so a failure says by how much rather
 * than only that it happened.
 */
export async function overflow(
  element: Locator,
): Promise<{ top: number; bottom: number; left: number; right: number }> {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();

    const edge = {
      top: box.top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
      bottom: box.bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth),
      left: box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
      right: box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
    };

    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()];

    const worst = (pick: (line: DOMRect) => number) =>
      lines.length === 0 ? 0 : Math.max(0, ...lines.map(pick));

    return {
      top: worst((line) => edge.top - line.top),
      bottom: worst((line) => line.bottom - edge.bottom),
      left: worst((line) => edge.left - line.left),
      right: worst((line) => line.right - edge.right),
    };
  });
}

/** Every cell of the card clips nothing, named individually so a failure says which. */
export async function expectNoCellClipped(page: Page): Promise<void> {
  const cells = page.getByLabel('Your card').locator('[data-label]');
  const count = await cells.count();
  expect(count).toBe(24);

  const clipped: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const cell = cells.nth(index);
    const past = await overflow(cell);
    const worst = Math.max(past.top, past.bottom, past.left, past.right);
    // Half a pixel of slack: the boxes are fractional, and an exact comparison
    // reports a rounding difference as a clipped label.
    if (worst > 0.5) {
      clipped.push(`${await cell.textContent()} (+${worst.toFixed(1)}px)`);
    }
  }

  expect(clipped, 'cells whose label leaves its own content box').toEqual([]);
}

/**
 * Nothing covers the card. This is the contract #9 and #11 wrote for the bottom slot
 * and the one that ruled variant B out entirely, so it is asserted geometrically
 * rather than by looking at a screenshot: the card's box and the row's box do not
 * intersect.
 *
 * `elementFromPoint` on its own is not enough — it answers for one pixel, and a row
 * that clips a card's bottom corner passes it at the centre.
 */
export async function expectClearOfTheCard(
  page: Page,
  overlay: Locator,
  what: string,
): Promise<void> {
  const card = await page.getByLabel('Your card').boundingBox();
  const row = await overlay.boundingBox();

  expect(card, 'the card has a box').not.toBeNull();
  expect(row, `${what} has a box`).not.toBeNull();

  const overlaps =
    row!.x < card!.x + card!.width &&
    row!.x + row!.width > card!.x &&
    row!.y < card!.y + card!.height &&
    row!.y + row!.height > card!.y;

  expect(
    overlaps,
    `${what} at y=${row!.y.toFixed(0)}..${(row!.y + row!.height).toFixed(0)} against a card ending at y=${(card!.y + card!.height).toFixed(0)}`,
  ).toBe(false);
}

/**
 * The right pane is *beside* the card, not merely clear of it.
 *
 * Written against #14's own seeded regression, which is the same lesson this file
 * keeps re-learning: stacking the two columns (`lg:flex-col` on the row) is a real
 * defect — the phone layout with extra steps — and `expectClearOfTheCard` passes it
 * happily, because a pane *below* the card intersects nothing. So "both columns up at
 * once" has to be said as geometry: the pane starts at or after the card's right
 * edge, and the two share vertical space.
 */
export async function expectBesideTheCard(
  page: Page,
  pane: Locator,
  what: string,
): Promise<void> {
  const card = await page.getByLabel('Your card').boundingBox();
  const beside = await pane.boundingBox();

  expect(card, 'the card has a box').not.toBeNull();
  expect(beside, `${what} has a box`).not.toBeNull();

  expect(
    beside!.x,
    `${what} starts at x=${beside!.x.toFixed(0)} against a card ending at x=${(card!.x + card!.width).toFixed(0)}`,
  ).toBeGreaterThanOrEqual(card!.x + card!.width);

  const sharedRows =
    Math.min(beside!.y + beside!.height, card!.y + card!.height) -
    Math.max(beside!.y, card!.y);
  expect(
    sharedRows,
    `pixels of height ${what} shares with the card — beside it, not under it`,
  ).toBeGreaterThan(0);
}

/**
 * No page scrolls sideways. A card one pixel too wide for the viewport is the
 * signature failure of this layout, and it hides: the horizontal scrollbar is
 * invisible on the devices this is for.
 */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() => {
    const root = document.documentElement;

    return root.scrollWidth - root.clientWidth;
  });

  expect(overflowing, 'pixels the document scrolls horizontally').toBeLessThanOrEqual(0);
}

/**
 * The page itself does not scroll vertically — which is a claim about the two-pane
 * layout only, where each column carries its own scroller. The phone layout is
 * *meant* to scroll: the card and the open-squares list under it are one page.
 *
 * Written against #14's own defect, and the hole it went through: the gate had an
 * instrument for horizontal scroll and none for vertical, so a right pane that grew
 * to 1427px and pushed the document 742px was invisible to a green run. Two columns
 * side by side is a promise that neither moves, and a page that scrolls breaks it
 * without either column being wrong about anything.
 */
export async function expectNoVerticalScroll(page: Page, what: string): Promise<void> {
  const overflowing = await page.evaluate(() => {
    const root = document.documentElement;

    return root.scrollHeight - root.clientHeight;
  });

  expect(overflowing, `pixels the document scrolls vertically with ${what}`).toBeLessThanOrEqual(0);
}

/**
 * Nothing a thumb has to hit is smaller than 44px, which is Apple's documented
 * minimum. #12 shipped a prototype whose own switcher was 22x24 and therefore
 * unreachable on the only two devices it existed to be judged on — a defect that was
 * invisible to review and immediate under a browser.
 */
export async function expectThumbSized(target: Locator, what: string): Promise<void> {
  const box = await target.boundingBox();

  expect(box, `${what} has a box`).not.toBeNull();
  expect(Math.min(box!.width, box!.height), `${what} smallest side`).toBeGreaterThanOrEqual(44);
}

/**
 * An element is whole on screen — inside the viewport on all four sides, so nothing
 * has to be scrolled to to be read or tapped.
 *
 * For the retract dialog, which is the one surface where "reachable" cannot mean
 * "reachable after scrolling": it is a `fixed inset-0` layer, so the page behind it
 * scrolls and the panel does not move with it. A button hanging below the fold there
 * is unreachable rather than merely awkward, and `expectNoVerticalScroll` cannot see
 * it — the document is as tall as it ever was.
 */
export async function expectWholeOnScreen(
  page: Page,
  target: Locator,
  what: string,
): Promise<void> {
  const box = await target.boundingBox();
  const view = page.viewportSize();

  expect(box, `${what} has a box`).not.toBeNull();
  expect(view, 'the page has a viewport').not.toBeNull();

  const past = {
    top: Math.max(0, -box!.y),
    left: Math.max(0, -box!.x),
    bottom: Math.max(0, box!.y + box!.height - view!.height),
    right: Math.max(0, box!.x + box!.width - view!.width),
  };

  expect(
    Math.max(past.top, past.bottom, past.left, past.right),
    `pixels ${what} runs outside a ${view!.width}x${view!.height} viewport (${JSON.stringify(past)})`,
  ).toBeLessThanOrEqual(0.5);
}

/** No row of a list runs outside its own box — the standings and timeline check. */
export async function expectNoRowClipped(rows: Locator, what: string): Promise<void> {
  const count = await rows.count();
  expect(count, `${what} has rows`).toBeGreaterThan(0);

  const clipped: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const past = await overflow(row);
    const worst = Math.max(past.top, past.bottom, past.left, past.right);
    if (worst > 0.5) clipped.push(`${await row.textContent()} (+${worst.toFixed(1)}px)`);
  }

  expect(clipped, `${what} rows leaving their own box`).toEqual([]);
}
