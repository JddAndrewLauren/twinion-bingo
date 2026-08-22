import { expect, test, type Page } from '@playwright/test';
import { openLobby, openRoom, type Lobby } from './room-fixture';
import {
  expectNoHorizontalScroll,
  expectNoRowClipped,
  expectThumbSized,
  expectWholeOnScreen,
} from './measure';

/**
 * #88's share dialog, and the reason it is gated rather than reviewed: it is a native
 * modal `<dialog>`, and everything that makes one *modal* — the top layer, the focus
 * move in, Escape, focus restore to the invoker — is the platform's and not the app's.
 * jsdom implements none of it, so `test/setup.ts` polyfills the open/closed state and
 * says out loud that it models nothing else. Here is where those claims are real.
 *
 * The canonical URL is the config's `baseURL`: no `SITE_URL` is set for the gate
 * server, so `app/site-origin.ts` resolves the origin off the request host.
 */
const SHARE_LINK = 'http://127.0.0.1:3210/r/ABCD';

const trigger = (page: Page) => page.getByRole('button', { name: 'Share room' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Share room ABCD' });

test.describe('where sharing is offered', () => {
  /**
   * Loading is the one resolved-state neighbour missing here: `openLobby` answers
   * every route, so there is no way through it to a roster that never settles. It
   * returns before the insertion point in the same way `missing` and `unreachable`
   * do, and `test/room-screen.test.tsx` pins it there.
   */
  for (const state of ['needs-a-name', 'roster', 'host-lobby'] as const) {
    test(`offers it in the ${state} state`, async ({ page }) => {
      await openLobby(page, state);

      await expect(trigger(page)).toHaveCount(1);
      await expectThumbSized(trigger(page), 'the Share room button');
      await expectNoHorizontalScroll(page);
    });
  }

  for (const state of ['missing', 'unreachable'] as const satisfies Lobby[]) {
    test(`offers nothing in the ${state} state`, async ({ page }) => {
      await openLobby(page, state);

      await expect(trigger(page)).toHaveCount(0);
    });
  }

  for (const stage of ['start', 'done'] as const) {
    test(`offers it from the slim bar at ${stage}`, async ({ page }) => {
      await openRoom(page, stage);

      await expect(trigger(page)).toHaveCount(1);
      await expectThumbSized(trigger(page), 'the Share room button');
      // The bar took a third item; the row must absorb it rather than widen.
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('the dialog itself', () => {
  /**
   * The same dialog over two different pages: the lobby's `max-w-md` centred column
   * and the game screen's full-bleed layout. A panel that fits one is not evidence
   * about the other, and the game screen is where the viewport is fullest.
   */
  for (const open of [
    { what: 'the game screen', go: (page: Page) => openRoom(page, 'mid') },
    { what: 'the lobby', go: (page: Page) => openLobby(page, 'roster') },
  ]) {
    test(`is whole on screen and thumb-sized from ${open.what}`, async ({ page }) => {
      await open.go(page);
      await trigger(page).tap();

      const dialog = panel(page);
      await expect(dialog).toBeVisible();
      await expectWholeOnScreen(page, dialog, 'the share dialog');

      // The full `http://host/r/CODE` in a ~320px panel is the wrap risk this
      // inherited from the lobby line it replaced.
      await expectNoRowClipped(dialog.locator('a'), 'the share link');

      await expectThumbSized(dialog.getByRole('link'), 'the share link');
      await expectThumbSized(
        dialog.getByRole('button', { name: 'Copy link' }),
        'the Copy link button',
      );
      await expectThumbSized(
        dialog.getByRole('button', { name: 'Close' }),
        'the Close button',
      );
      // Centred rather than in a corner: a modal `<dialog>` centres by the UA
      // sheet's `margin: auto`, and Tailwind's preflight zeroes it, so this is the
      // app's claim and not the platform's. Half a pixel of slack for a fractional
      // box, the same tolerance the instruments use.
      const box = (await dialog.boundingBox())!;
      const view = page.viewportSize()!;
      expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThanOrEqual(0.5);

      await expectNoHorizontalScroll(page);
    });
  }

  test('offers the canonical room URL both to read and to scan', async ({ page }) => {
    await openRoom(page, 'mid');
    await trigger(page).tap();

    const dialog = panel(page);
    await expect(dialog.getByRole('link')).toHaveAttribute('href', SHARE_LINK);
    await expect(dialog.getByText('ABCD', { exact: true })).toBeVisible();
    // The QR's `<title>` is what it encodes, said in the accessibility tree — the
    // one place the modules can be read back without decoding an image.
    await expect(dialog.locator('svg title')).toHaveText(SHARE_LINK);
  });

  /**
   * Deliberately *either* message. WebKit's clipboard permission is not grantable
   * from Playwright, so which branch runs here is the browser's business; the
   * success/fallback split is pinned deterministically in jsdom. What the gate is
   * for is that a tap always answers — a Copy that says nothing is the failure a
   * screenshot cannot show.
   */
  test('answers a Copy link tap either way', async ({ page }) => {
    await openRoom(page, 'mid');
    await trigger(page).tap();

    await panel(page).getByRole('button', { name: 'Copy link' }).tap();

    // Scoped to the dialog: the game screen behind it has a live region of its own
    // for the spotter credit.
    await expect(panel(page).getByRole('status')).not.toBeEmpty();
  });
});

test.describe('the dialog as a modal', () => {
  test('opens on the primary action, inside the dialog', async ({ page }) => {
    await openRoom(page, 'mid');
    await trigger(page).tap();

    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    // Focus moved *into* the dialog at all is what makes the trap and Escape mean
    // anything: `showModal()` does that and `show()` does not. Where it landed is
    // the second claim — the `autofocus` attribute on Copy link, and not the first
    // focusable, which is the link above it.
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeFocused();
  });

  /**
   * Focus restore on the keyboard path, which is the platform's own: the invoker was
   * focused, so `close()` hands focus back with nothing from the app. The tap path
   * below is the app's, and the two are separate tests because they fail separately.
   */
  test('closes on Escape and hands focus back', async ({ page }) => {
    await openRoom(page, 'mid');

    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  test('closes on Close and hands focus back the same way', async ({ page }) => {
    await openRoom(page, 'mid');

    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();

    await panel(page).getByRole('button', { name: 'Close' }).tap();

    await expect(panel(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  /**
   * The tap path, and the reason `onClose` focuses the trigger rather than trusting
   * the platform: WebKit does not focus a `<button>` on tap, so a tapped-open dialog
   * has an invoker that was never focused and nothing for `close()` to restore to.
   * Measured before the fix, at `phone-small`: `document.activeElement` after a
   * tapped Close was the closed `<dialog>` itself — `display: none`, so the next Tab
   * or VoiceOver step restarts at the top of the document rather than beside the
   * trigger. Asserted as "not inside the dialog" as well as "on the trigger", because
   * that is the failure in the words it actually took.
   */
  test('hands focus back on the touch path too', async ({ page }) => {
    await openRoom(page, 'mid');

    await trigger(page).tap();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Close' }).tap();
    await expect(panel(page)).toBeHidden();

    await expect(trigger(page)).toBeFocused();
    expect(
      await page.evaluate(() => document.activeElement?.closest('dialog') !== null),
    ).toBe(false);
  });

  /**
   * A modal `<dialog>` is in the top layer and out of flow, so opening it cannot
   * reflow the page behind it. That is structural rather than a coincidence of this
   * markup — which is exactly why it is worth measuring: the way it stops being true
   * is somebody replacing the dialog with a laid-out panel.
   */
  test('does not move the card', async ({ page }) => {
    await openRoom(page, 'mid');

    const card = page.getByLabel('Your card');
    const before = await card.boundingBox();

    await trigger(page).tap();
    await expect(panel(page)).toBeVisible();
    expect(await card.boundingBox()).toEqual(before);

    await panel(page).getByRole('button', { name: 'Close' }).tap();
    await expect(panel(page)).toBeHidden();
    expect(await card.boundingBox()).toEqual(before);
  });

  /**
   * Sharing mid-race must not cost the race. `streams()` counts every `EventSource`
   * the page ever opened, so on its own it catches a re-opened stream and not a
   * dropped one: a sole source that closed and was never replaced still counts 1.
   * So the live half is a frame pushed down the stream after the dialog has been and
   * gone, and the credit it raises — delivery through the source that was already
   * there, rather than the fact that one was once constructed.
   *
   * The credit rather than the mark: a mark comes back from the game re-read the
   * frame triggers, and this fixture's log is only appended to by its own `/call`
   * route. The toast is what an emitted frame alone can prove, and it is the whole
   * path — source, handler, render.
   */
  test('does not drop the stream', async ({ page }) => {
    const room = await openRoom(page, 'mid');

    expect(await room.streams()).toBe(1);

    await trigger(page).tap();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Close' }).tap();
    await expect(panel(page)).toBeHidden();

    expect(await room.streams()).toBe(1);

    // The card's last square, uncalled at `mid` — so this frame is news rather than
    // a replay of something already on screen.
    const square = room.square(23);
    await room.emit({
      seq: 900,
      kind: 'CALL',
      actorPlayerId: 'guest-id',
      squareId: square.id,
    });

    await expect(page.getByText(`Bea spotted ${square.label}`)).toBeVisible();
  });
});
