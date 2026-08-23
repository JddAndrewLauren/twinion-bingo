import { expect, test, type Page, type Route } from '@playwright/test';
import { expectNoHorizontalScroll, expectThumbSized, expectWholeOnScreen } from './measure';

/**
 * The one screen in `docs/SURFACES.md`'s table with no gate, carried as "signed off
 * by eye" since #4. `install.gate.ts` already navigates to `/`, but only to read the
 * document head and the manifest — no layout, geometry, or tap-target assertion, so
 * there is no overlap with what this file adds.
 *
 * Two API calls the app makes from here: the room-creation `POST` and the health
 * `GET`, both routed below. `playwright.config.ts` points `NEXT_PUBLIC_API_URL` at an
 * unresolvable host, so a missed route fails loudly. No test here submits the create
 * form — submitting navigates to `/r/:code` on success, which would also need the
 * room read and the game read routed for a screen this file is not about — so the
 * create-room route exists only to keep a missed interception loud if that ever
 * changes, and every assertion below is made without submitting.
 */

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openHome(
  page: Page,
  options: { holdHealth?: boolean; healthOutcome?: 'ok' | 'failure' } = {},
): Promise<{ resolveHealth: () => void }> {
  let resolveHealth = () => {};
  const gate = options.holdHealth
    ? new Promise<void>((resolve) => {
        resolveHealth = resolve;
      })
    : Promise.resolve();

  await page.route('**/health', async (route) => {
    await gate;
    // `route.abort()` is a transport failure — the same shape `api-health.tsx`'s own
    // catch block treats as "unreachable" rather than a 4xx/5xx reply, which the
    // component would instead read as `failing`.
    if (options.healthOutcome === 'failure') {
      await route.abort('connectionrefused');
      return;
    }
    await json(route, { status: 'all clear' });
  });

  await page.route('**/rooms', (route) =>
    json(route, { code: 'ABCD', token: 'gate-token', player: { id: 'p', name: 'Ash', joinSeq: 1 } }),
  );

  await page.goto('/');
  // The webfont decides every measurement here, and it arrives after first paint
  // (`display: 'swap'`) — measuring before it lands grades the page on the fallback
  // face, the mistake #12 made and had to re-run for.
  await page.evaluate(() => document.fonts.ready);

  return { resolveHealth };
}

test.describe('the home screen', () => {
  test('fits both forms and the health line at phone-small without scrolling past the first form', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone-small', 'this criterion names phone-small only');
    await openHome(page);

    await expect(page.getByRole('heading', { name: 'Start a room' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Create a room' })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Join with a code' })).toBeInViewport();
    // The bottom-most two: `toBeInViewport()` alone would pass on a single
    // intersecting pixel, which is weaker than "on screen without scrolling" — so
    // these two, the ones actually at risk of falling off the bottom, are asserted
    // whole rather than merely intersecting.
    await expectWholeOnScreen(page, page.getByRole('button', { name: 'Join' }), 'the Join button');
    await expectWholeOnScreen(page, page.getByText(/^API:/), 'the API health line');
  });

  test('holds both submit buttons to a thumb-sized minimum', async ({ page }) => {
    await openHome(page);

    await expectThumbSized(page.getByRole('button', { name: 'Create a room' }), 'the Create a room button');
    await expectThumbSized(page.getByRole('button', { name: 'Join' }), 'the Join button');
  });

  test('scrolls nowhere sideways', async ({ page }) => {
    await openHome(page);

    await expectNoHorizontalScroll(page);
  });

  /**
   * #103: the Theme button mounts here too, beside the page's own `<h1>` — the
   * first of the four surfaces its acceptance criteria name.
   */
  test('offers the Theme button, thumb-sized, without pushing anything off screen', async ({
    page,
  }) => {
    await openHome(page);

    const theme = page.getByRole('button', { name: 'Theme' });
    await expect(theme).toBeVisible();
    await expectThumbSized(theme.locator('[data-hit-expand]'), "the Theme button's hit element");

    /*
      And it stands alone here. #108 puts the die on the other three headers —
      join, lobby, game — but not on `/`, which has no room, no game and no card
      to re-roll; `docs/SURFACES.md`'s header row says so, so this is what holds
      the table to it rather than leaving the absence to be inferred from a page
      nobody edited.
    */
    await expect(page.getByRole('button', { name: 'Re-roll card' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('does not shift the layout when the health line settles on success', async ({ page }) => {
    const { resolveHealth } = await openHome(page, { holdHealth: true, healthOutcome: 'ok' });

    const health = page.getByText(/^API:/);
    await expect(health).toHaveText('API: checking…');
    const before = await health.boundingBox();

    resolveHealth();
    await expect(health).toHaveText('API: all clear');
    const after = await health.boundingBox();

    expect(before, 'the health line has a box before it resolves').not.toBeNull();
    expect(after, 'the health line has a box after it resolves').not.toBeNull();
    expect(after!.x, 'the health line moved horizontally when it resolved').toBeCloseTo(before!.x, 0);
    expect(after!.y, 'the health line moved vertically when it resolved').toBeCloseTo(before!.y, 0);
  });

  /**
   * The acceptance criterion names the *failure* state explicitly, and a success
   * case cannot stand in for it: `checking…` (12 characters) to `all clear` (9) is a
   * narrower text-length change than `checking…` to `unreachable` (11), and the
   * failure states are the ones a flaky venue Wi-Fi actually produces mid-race.
   */
  test('does not shift the layout when the health line settles on a failure', async ({ page }) => {
    const { resolveHealth } = await openHome(page, { holdHealth: true, healthOutcome: 'failure' });

    const health = page.getByText(/^API:/);
    await expect(health).toHaveText('API: checking…');
    const before = await health.boundingBox();

    resolveHealth();
    await expect(health).toHaveText('API: unreachable');
    const after = await health.boundingBox();

    expect(before, 'the health line has a box before it resolves').not.toBeNull();
    expect(after, 'the health line has a box after it settles on a failure').not.toBeNull();
    expect(after!.x, 'the health line moved horizontally when it failed').toBeCloseTo(before!.x, 0);
    expect(after!.y, 'the health line moved vertically when it failed').toBeCloseTo(before!.y, 0);
  });
});
