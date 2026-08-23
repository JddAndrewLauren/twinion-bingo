import { expect, test, type Page, type Route } from '@playwright/test';
import { expectNoHorizontalScroll, expectThumbSized } from './measure';

/**
 * `/admin` (#125): the one operator surface in the app, gated by a shared
 * secret rather than a room code or a player token. `docs/SURFACES.md` pins
 * its layout claim to `phone` — the first row in that file to name a viewport
 * other than the default — so the "fits without scrolling" assertion below
 * skips every other project rather than running redundantly at four sizes.
 *
 * The reveal-nothing claim is the acceptance criterion the issue itself names
 * ("Without the secret, /admin reveals nothing about whether any room
 * exists"), so it is asserted at every viewport: no table, no room code,
 * whether no secret was tried yet or the wrong one was.
 */

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openAdmin(page: Page): Promise<void> {
  await page.goto('/admin');
  await page.evaluate(() => document.fonts.ready);
}

test.describe('the admin room list, locked', () => {
  test('offers only the secret form — no room data before or after a wrong guess', async ({ page }) => {
    await page.route('**/admin/rooms', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) }),
    );

    await openAdmin(page);
    await expect(page.getByLabel('Admin secret')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(/ABCD/)).toHaveCount(0);

    await page.getByLabel('Admin secret').fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();

    await expect(page.getByText('Wrong secret.')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(/ABCD/)).toHaveCount(0);
  });

  test('scrolls nowhere sideways while locked', async ({ page }) => {
    await page.route('**/admin/rooms', (route) => route.fulfill({ status: 401 }));
    await openAdmin(page);

    await expectNoHorizontalScroll(page);
  });

  test('holds the secret field and Unlock button to a thumb-sized minimum', async ({ page }) => {
    await page.route('**/admin/rooms', (route) => route.fulfill({ status: 401 }));
    await openAdmin(page);

    await expectThumbSized(page.getByLabel('Admin secret'), 'the admin secret field');
    await expectThumbSized(page.getByRole('button', { name: 'Unlock' }), 'the Unlock button');
  });
});

test.describe('the admin room list, unlocked', () => {
  test('fits the room list at phone without scrolling sideways, and refreshes on its own', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'phone',
      "phone is this screen's primary viewport, per docs/SURFACES.md",
    );

    let requests = 0;
    await page.route('**/admin/rooms', (route) => {
      requests += 1;
      return json(route, {
        rooms: [
          {
            code: 'ABCD',
            themeId: 'f1.v2',
            playerCount: requests === 1 ? 2 : 5,
            players: [
              { id: 'p1', name: 'Ash' },
              { id: 'p2', name: 'Bea' },
            ],
            gameState: requests === 1 ? 'lobby' : 'live',
            ageSeconds: 90,
          },
        ],
      });
    });

    await openAdmin(page);
    await page.getByLabel('Admin secret').fill('lax-paddock');
    await page.getByRole('button', { name: 'Unlock' }).click();

    await expect(page.getByRole('cell', { name: 'ABCD' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'lobby' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // The list refreshes on its own timer — no reload, no re-submit — so the
    // second poll's state has to arrive without any further interaction here.
    await expect(page.getByRole('cell', { name: 'live' })).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * #126's three mutating actions, gated at `phone` alongside the rest of this
 * screen (docs/SURFACES.md's "Admin — mutating actions" row) — none of it is
 * skin-dependent, so one viewport is the whole claim, the same reasoning the
 * read-only list above already applies.
 */
test.describe('the admin room list, mutating actions', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'phone',
      "phone is this screen's primary viewport, per docs/SURFACES.md",
    );
  });

  async function unlockWithOneLiveRoom(page: Page): Promise<void> {
    await page.route('**/admin/rooms', (route) =>
      json(route, {
        rooms: [
          {
            code: 'ABCD',
            themeId: 'f1.v2',
            playerCount: 1,
            players: [{ id: 'p1', name: 'Ash' }],
            gameState: 'live',
            ageSeconds: 90,
          },
        ],
      }),
    );

    await openAdmin(page);
    await page.getByLabel('Admin secret').fill('lax-paddock');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('cell', { name: 'ABCD' })).toBeVisible();
  }

  test('offers End game, Delete and Kick, thumb-sized and without scrolling the row sideways', async ({
    page,
  }) => {
    await unlockWithOneLiveRoom(page);

    const endGame = page.getByRole('button', { name: 'End game' });
    const del = page.getByRole('button', { name: 'Delete' });
    const kick = page.getByRole('button', { name: 'Kick' });

    await expect(endGame).toBeVisible();
    await expect(del).toBeVisible();
    await expect(kick).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('confirms before force-ending a game, and sends nothing on a declined confirm', async ({
    page,
  }) => {
    await unlockWithOneLiveRoom(page);

    let ended = false;
    await page.route('**/admin/rooms/ABCD/game/end', (route) => {
      ended = true;
      return route.fulfill({ status: 204 });
    });

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'End game' }).click();
    expect(ended).toBe(false);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'End game' }).click();
    await expect.poll(() => ended).toBe(true);
  });

  test('kicks a named player after confirming', async ({ page }) => {
    await unlockWithOneLiveRoom(page);

    let kicked = false;
    await page.route('**/admin/rooms/ABCD/players/p1/kick', (route) => {
      kicked = true;
      return route.fulfill({ status: 204 });
    });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Kick' }).click();

    await expect.poll(() => kicked).toBe(true);
  });
});
