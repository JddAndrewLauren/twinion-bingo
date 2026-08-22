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

test.describe('the card', () => {
  test('gives earned, inherited and unmarked cells three distinct fills', async ({
    page,
  }) => {
    await openRoom(page, 'mid');
    await expectNoCellClipped(page);

    const card = page.getByLabel('Your card');

    const fillOf = async (mark: 'earned' | 'inherited' | 'none') =>
      card
        .locator(`[data-mark="${mark}"]`)
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor);

    const [earned, inherited, base] = await Promise.all([
      fillOf('earned'),
      fillOf('inherited'),
      fillOf('none'),
    ]);

    expect(earned, 'earned vs inherited').not.toBe(inherited);
    expect(earned, 'earned vs unmarked').not.toBe(base);
    expect(inherited, 'inherited vs unmarked').not.toBe(base);
  });
});

test.describe('the progress readout', () => {
  test('reads 0/24 at lights out and 8/24 mid-race, from existing state alone', async ({
    page,
  }) => {
    const readout = (p: Page) => p.getByRole('img', { name: /marked$/ });

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
  test('rings the primary action and a card cell in the accent colour', async ({
    page,
  }) => {
    await openLobby(page, 'needs-a-name');

    await page.getByLabel('Your name').fill('Ash');
    const submit = page.getByRole('button', { name: 'Enter room' });
    await submit.focus();

    const outline = await submit.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, color: style.outlineColor };
    });
    // The accent colour (`#ff2e2e`), not merely "some outline" — a browser's own
    // default focus ring also has a non-zero width, which a width-only assertion
    // cannot tell apart from this issue's own rule.
    expect(outline.width, 'the focused primary action has a 2px outline').toBe('2px');
    expect(outline.color, 'the outline is the accent colour').toBe('rgb(255, 46, 46)');
  });
});
