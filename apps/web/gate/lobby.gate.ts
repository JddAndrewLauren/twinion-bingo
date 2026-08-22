import { expect, test, type Page } from '@playwright/test';
import { openLobby } from './room-fixture';
import {
  expectNoHorizontalScroll,
  expectNoRowClipped,
  expectThumbSized,
} from './measure';

/**
 * #103: the Theme button's hit element, asserted the same way in both of this
 * file's states that acceptance-criteria name — the join form and the lobby.
 */
async function expectThemeButton(page: Page): Promise<void> {
  const theme = page.getByRole('button', { name: 'Theme' });
  await expect(theme).toBeVisible();
  await expectThumbSized(theme.locator('[data-hit-expand]'), "the Theme button's hit element");
}

/**
 * #108: the die beside it, on these same two screens, disabled rather than
 * hidden — there is no card here to re-roll, but the handoff draws the die on
 * every header ("join and card alike"), so it stays present and legible as
 * unavailable rather than absent.
 */
async function expectDisabledDie(page: Page): Promise<void> {
  const die = page.getByRole('button', { name: 'Re-roll card' });
  await expect(die).toBeVisible();
  await expect(die).toBeDisabled();
  await expectThumbSized(die.locator('[data-hit-expand]'), "the die's hit element");
}

/**
 * Everything before the deal, which `docs/SURFACES.md` has carried as "signed off by
 * eye" since #4 — the criteria that made it write that file in the first place.
 *
 * They are gated now because #13 changed them: the game screen went full-bleed, so the
 * page's `max-w-md` centred column moved off `page.tsx` and into each of these states.
 * A layout that changed without a gate is exactly the situation the registry exists to
 * end, and the instruments were already here.
 */

test.describe('joining', () => {
  test('fits the name form and says whether it can be submitted', async ({ page }) => {
    await openLobby(page, 'needs-a-name');

    const heading = page.getByRole('heading', { name: 'Join room ABCD' });
    await expect(heading).toBeVisible();
    await expectNoRowClipped(heading, 'the join heading');

    // Disabled until there is a name, enabled after — the state has to be legible,
    // and it has to be a thumb-sized target either way.
    const submit = page.getByRole('button', { name: 'Join' });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Your name').fill('Ash');
    await expect(submit).toBeEnabled();
    await expectThumbSized(submit, 'the Join button');

    await expectThemeButton(page);
    await expectDisabledDie(page);
    await expectNoHorizontalScroll(page);
  });
});

/**
 * The share link was the risk here and always had been: it was a full
 * `https://host/r/CODE` rendered as body text, so a long deploy hostname was what made
 * it overflow rather than wrap. #88 put it behind **Share room**, so the wrap risk
 * moved into the dialog with it — `share.gate.ts` carries that assertion now, against
 * the dialog's own ~320px column.
 */
test.describe('the lobby', () => {
  test('lists the roster with its host and you suffixes intact', async ({ page }) => {
    await openLobby(page, 'roster');

    const rows = page.getByRole('listitem');
    await expect(rows.filter({ hasText: '(host)' })).toHaveCount(1);
    await expect(rows.filter({ hasText: '— you' })).toHaveCount(1);
    await expectNoRowClipped(rows, 'the roster');
    await expectThemeButton(page);
    await expectDisabledDie(page);
    await expectNoHorizontalScroll(page);
  });

  /**
   * The host's own view. The criterion is reach: **Start game** below the roster and
   * on screen without scrolling past the share control, at the tightest width.
   */
  test('puts the host`s Start game button on screen without scrolling', async ({ page }) => {
    await openLobby(page, 'host-lobby');

    const start = page.getByRole('button', { name: 'Start game' });
    await expect(start).toBeInViewport();
    await expectThumbSized(start, 'the Start game button');
    await expectThemeButton(page);
    await expectDisabledDie(page);
    await expectNoHorizontalScroll(page);
  });

  test('offers no Start game to anyone but the host', async ({ page }) => {
    await openLobby(page, 'roster');

    await expect(page.getByRole('button', { name: 'Share room' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start game' })).toHaveCount(0);
  });
});

/**
 * The two ways a room fails to resolve, which have to read differently from each other:
 * one is an answer to what you typed, the other is the app being unable to ask.
 */
test.describe('a room that does not resolve', () => {
  test('answers an unknown code as an answer, not an error page', async ({ page }) => {
    await openLobby(page, 'missing');

    const line = page.getByText('No room has the code ABCD.');
    await expect(line).toBeVisible();
    await expectNoRowClipped(line, 'the missing-room line');
    await expectNoHorizontalScroll(page);
  });

  test('distinguishes an unreachable API from a missing room', async ({ page }) => {
    await openLobby(page, 'unreachable');

    await expect(page.getByText('Could not reach the room.')).toBeVisible();
    await expect(page.getByText('No room has the code ABCD.')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});
