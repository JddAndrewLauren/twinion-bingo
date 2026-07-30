import { expect, test, type Locator, type Page } from '@playwright/test';
import { openRoom } from './room-fixture';
import {
  expectClearOfTheCard,
  expectNoCellClipped,
  expectNoHorizontalScroll,
  expectNoRowClipped,
  expectThumbSized,
} from './measure';

/**
 * The room screen's gate: #12's C1, built for real by #13.
 *
 * Every test here runs at all four `docs/SURFACES.md` viewports, in WebKit, with
 * touch — see the note in `playwright.config.ts` for why each of those three is not
 * negotiable. Everything is driven rather than read: #12 recorded three defects that
 * code review could not see and a browser found immediately, and the whole reason
 * this file exists is that four of #4's acceptance criteria were layout claims signed
 * off by eye.
 */

/**
 * The spotter credit, located as the toast rather than by its words. `getByText(/
 * spotted/)` cannot be used here: the timeline is a list of the same sentence, so it
 * matches thirteen rows on a mid-race card and the one that matters is the only one
 * that is not in a list.
 */
const credit = (page: Page) => page.locator('p[role="status"]');

/** The undo row itself, not the span inside it — the row is what covers or does not. */
const undoRow = (page: Page): Locator => page.getByText(/^Called /).locator('xpath=..');

test.describe('the card', () => {
  /**
   * #47's first criterion, and the tightest layout in the project. The labels are the
   * 30-character cap with a 13-character longest word rather than the committed
   * pool's 10 — see the note in the fixture on why gating the pool as it stands is
   * gating zero headroom.
   */
  test('carries the cap without a cell clipping', async ({ page }, info) => {
    await openRoom(page, 'start');

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);

    // `docs/SURFACES.md` records cell width against computed font size per viewport,
    // so the run emits that pair rather than leaving the next person to re-derive it.
    info.annotations.push({
      type: 'card',
      description: await page.getByLabel('Your card').evaluate((grid) => {
        const label = grid.querySelector('[data-label]')!;
        const cell = label.parentElement!.getBoundingClientRect().width;

        return `cell ${cell.toFixed(0)}px / font ${parseFloat(getComputedStyle(label).fontSize).toFixed(1)}px`;
      }),
    });
  });

  /**
   * A marked label is bolder, so a label that fitted unmarked has to be re-checked
   * marked — #8's run wrote that down and it is still true.
   */
  test('carries it marked too, earned and inherited', async ({ page }) => {
    await openRoom(page, 'mid');

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);
  });

  /**
   * #47's *mechanism*, which is a separate assertion from #47's symptom — and this
   * gate learned that the hard way. Reintroducing the defect (a `1.7vw` clamp behind a
   * `max-w-md` page) and re-running `carries the cap` above passes at all four
   * viewports, because shrink-to-fit repairs the clipping after the fact. So a clipping
   * check alone cannot see #47 and would have let it back in.
   *
   * What actually has to hold is that cell text is a fraction of the *card's* width
   * rather than the viewport's, because that is what holds characters-per-line constant
   * everywhere. With the old sizing, type reached its 0.8rem ceiling from ~753px up
   * while the cell stayed pinned, so an iPad cell fitted *fewer* characters per line
   * than a phone cell — about 10 against about 13.
   *
   * **The assertion has to span two viewports, and that is the point.** A ratio checked
   * at one size cannot express "the same ratio everywhere", and the defect slips through
   * a single-viewport check by coincidence: behind `max-w-md` the card is 448px and the
   * clamp's 0.8rem ceiling is 12.8px, which is 2.9% of it — indistinguishable from a
   * correct `3cqw` on that one measurement. So this test resizes and compares, which is
   * the only shape of assertion the bug cannot satisfy.
   */
  test('sizes its type against the card, not the viewport', async ({ page }, info) => {
    await openRoom(page, 'start');

    const read = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      const measured = await page.getByLabel('Your card').evaluate((grid) => {
        const label = grid.querySelector('[data-label]')!;

        return {
          card: grid.getBoundingClientRect().width,
          cell: label.parentElement!.getBoundingClientRect().width,
          font: parseFloat(getComputedStyle(label).fontSize),
        };
      });

      // The numbers `docs/SURFACES.md` records per viewport, so a run says what it saw
      // rather than only whether it liked it.
      info.annotations.push({
        type: 'card',
        description: `${width}x${height}: card ${measured.card.toFixed(0)}px / cell ${measured.cell.toFixed(0)}px / font ${measured.font.toFixed(1)}px`,
      });

      return measured;
    };

    const narrow = await read(390, 844);
    const wide = await read(1194, 834);

    // 3cqw is 3% of the card, at both sizes and therefore at every size between.
    for (const measured of [narrow, wide]) {
      expect(measured.font / measured.card).toBeGreaterThan(0.028);
      expect(measured.font / measured.card).toBeLessThan(0.032);
    }

    // And the cell grew with the card rather than staying pinned while the type went
    // on growing past it, which is #47 stated as a comparison rather than a constant.
    expect(wide.cell).toBeGreaterThan(narrow.cell * 1.5);
    expect(wide.font / wide.cell).toBeCloseTo(narrow.font / narrow.cell, 2);
  });

  /**
   * The blind spot that let a real defect through, so it is a test of its own.
   *
   * A marked cell renders `font-semibold`, which makes the label *wider*. The fit used
   * to be computed at the regular weight and never recomputed, because the effect
   * keys on the label text and a call changes only the weight — so four cells at
   * `phone` clipped by 0.8px once called. `carries it marked too` above cannot see it:
   * it serves the marks in the first render, so the fit is computed with the bold
   * already applied. Only the live unmarked-to-marked transition was broken, and
   * that is the only transition a race actually performs.
   */
  test('keeps every cell unclipped as marking emboldens its label', async ({ page }) => {
    const room = await openRoom(page, 'start');

    await expectNoCellClipped(page);

    for (let index = 0; index < 24; index += 1) {
      await page.getByRole('button', { name: room.square(index).label }).first().tap();
    }
    await expect(page.getByLabel('Your card').locator('[aria-pressed="true"]')).toHaveCount(24);

    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);
  });

  /** A cell is a tap target before it is anything else. */
  test('has thumb-sized cells', async ({ page }) => {
    const room = await openRoom(page, 'start');

    await expectThumbSized(
      page.getByRole('button', { name: room.square(0).label }),
      'a card cell',
    );
  });
});

test.describe('the slim bar and the two surfaces', () => {
  test('says where you are without covering the card', async ({ page }) => {
    await openRoom(page, 'mid');

    // Mark count, the rung being played for, and who is here — all three on one line
    // at 375 CSS px, which is the width that decides whether they fit.
    const bar = page.getByRole('banner').or(page.locator('header')).first();
    await expect(bar).toContainText('marks');
    await expect(bar).toContainText('next');
    await expect(bar).toContainText('here');
    await expectNoRowClipped(bar.locator('p'), 'the slim bar');
    await expectNoHorizontalScroll(page);
  });

  /**
   * C1's departure from D14 as first written: no swipe-up sheet and no gesture, two
   * whole surfaces and a segmented control. So what is gated is that the tabs are
   * reachable by thumb and that neither surface covers the other.
   */
  test('switches surfaces by tap, and comes back to the card unmoved', async ({ page }) => {
    await openRoom(page, 'mid');

    await expectThumbSized(page.getByRole('tab', { name: 'Card' }), 'the Card tab');
    await expectThumbSized(page.getByRole('tab', { name: 'Race' }), 'the Race tab');

    const before = await page.getByLabel('Your card').boundingBox();

    await page.getByRole('tab', { name: 'Race' }).tap();
    await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible();
    await expect(page.getByLabel('Your card')).toBeHidden();

    await page.getByRole('tab', { name: 'Card' }).tap();
    await expect(page.getByLabel('Your card')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Standings' })).toBeHidden();

    // The grid is where it was, to the pixel: both panels stay mounted, so nothing
    // was re-measured and no scroll position was lost.
    expect(await page.getByLabel('Your card').boundingBox()).toEqual(before);
    await expectNoHorizontalScroll(page);
  });

  /**
   * The Race surface is the standings and the timeline at full width, which is what
   * C won on. A 24-character name is the roster's cap and the row that shows it.
   */
  test('reads the race out without a row overflowing', async ({ page }) => {
    await openRoom(page, 'mid');
    await page.getByRole('tab', { name: 'Race' }).tap();

    const panel = page.getByRole('tabpanel', { name: 'Race' });
    await expectNoRowClipped(panel.locator('li'), 'the race panel');
    await expectNoHorizontalScroll(page);
  });
});

/**
 * D4's second field on a phone: a ~68pt cell has room for `label` and not for
 * `description`. This is the criterion no unit test can reach, because a hold is a
 * gesture and a gesture needs a device.
 */
test.describe('a square`s prose', () => {
  test('is revealed by a hold, and covers no part of the card', async ({ page }) => {
    const room = await openRoom(page, 'start');

    // A tap is a call, not a peek. The two gestures start identically, so this is
    // the half of the criterion that says they stay told apart — and it is asserted
    // against the panel's own hook rather than against its text, because searching
    // for the prose passes just as happily if the panel never renders at all.
    await page.getByRole('button', { name: room.square(0).label }).tap();
    await expect(page.locator('[data-prose]')).toHaveCount(0);

    /*
      A hold on a different square: press, wait past the 400ms threshold, and read
      before letting go. Driven with the pointer rather than dispatched, because a
      dispatched event skips the hit test — and hit-testing is exactly what #12's
      "invisible band swallowing taps" defect failed.
    */
    const held = page.getByRole('button', { name: room.square(1).label });
    const box = (await held.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);

    const panel = page.locator('[data-prose]');
    await expect(panel).toContainText(room.square(1).description);
    await expectClearOfTheCard(page, panel, 'the prose panel');
    await expectNoRowClipped(panel.locator('p'), 'the prose panel');

    await page.mouse.up();
    await expect(panel).toHaveCount(0);

    // And the release did not also call the square the hold was asking about.
    await expect(held).toHaveAttribute('aria-pressed', 'false');
    await expectNoHorizontalScroll(page);
  });

  /**
   * The one that a shared flag got wrong, and the reason this test exists at all.
   *
   * `hold()` used to reset the "this press was a hold" flag on *every* pointerdown, so
   * a second pointer landing anywhere on the card cleared it — and releasing the held
   * square then called it for the whole room. On a full-bleed one-handed card the
   * second pointer is a resting thumb, so this was reachable by holding the phone.
   */
  test('is not turned into a call by a second pointer on another cell', async ({ page }) => {
    const room = await openRoom(page, 'start');
    const calls: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/call')) calls.push(request.postData() ?? '');
    });

    const held = page.getByRole('button', { name: room.square(1).label });
    const box = (await held.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-prose]')).toHaveCount(1);

    // A supporting thumb brushing another cell: pointerdown and nothing else.
    await page.getByRole('button', { name: room.square(2).label }).dispatchEvent('pointerdown');
    await page.mouse.up();

    // Nothing was called, and the square that was held is still unmarked. Asserted on
    // the request log as well as the cell, because a call that posts and is then
    // re-read away would still have marked it for everyone else in the room.
    await expect(held).toHaveAttribute('aria-pressed', 'false');
    expect(calls, 'a hold must post no call').toEqual([]);
  });
});

/**
 * The list is the whole difference between the prototype's C and its C1. #12
 * evidenced its worst case — all 24 rows up at lights out, descriptions to 127
 * characters — so that is what is gated.
 */
test.describe('what am I looking for', () => {
  test('opens to 24 rows at lights out without one overflowing', async ({ page }) => {
    await openRoom(page, 'start');

    const toggle = page.getByRole('button', { name: /What am I looking for/ });
    await expect(toggle).toContainText('(24)');
    await expectThumbSized(toggle, 'the list toggle');

    await toggle.tap();
    const rows = page.getByLabel('Squares still open').locator('li');
    await expect(rows).toHaveCount(24);
    await expectNoRowClipped(rows, 'the open squares list');
    await expectNoHorizontalScroll(page);

    // Shut again, and the card is back where it started rather than scrolled away.
    await toggle.tap();
    await expect(rows).toHaveCount(0);
  });

  test('empties out as the card fills', async ({ page }) => {
    await openRoom(page, 'done');

    await expect(page.getByRole('button', { name: /What am I looking for/ })).toContainText('(0)');
  });
});

/**
 * The bottom slot, and the contract that ruled variant B out entirely: whatever lands
 * in it covers no part of the card. C makes that a property of the layout rather than
 * a measurement to re-take, because the slot is docked in flow — so what is gated here
 * is that it stays true with the slot at its fullest.
 */
test.describe('the bottom slot', () => {
  test('offers your own call back without covering the card', async ({ page }) => {
    const room = await openRoom(page, 'start');

    const square = page.getByRole('button', { name: room.square(0).label });
    await square.tap();

    // The tap really called it: the mark arrives by the re-read of the game, which is
    // the same path every other phone's marks arrive by. Asserted here because it is
    // what makes the rest of this test about a real call rather than a rendered row.
    await expect(square).toHaveAttribute('aria-pressed', 'true');

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();
    await expectThumbSized(undo, 'the Undo button');
    await expectClearOfTheCard(page, undoRow(page), 'the undo row');
    await expectNoRowClipped(page.getByText(/^Called /), 'the undo row');
    await expectNoHorizontalScroll(page);

    // And it takes the call back. "Reachable" has to mean the button does its job:
    // the square unmarks by the re-read, which is the only way a mark ever goes.
    await undo.tap();
    await expect(square).toHaveAttribute('aria-pressed', 'false');
    await expect(undo).toHaveCount(0);
  });

  /**
   * Two rows at once — #9's and #11's "credit over undo" case, driven for real off
   * the stream rather than simulated. Both have to be on screen, and neither may
   * touch the card.
   */
  test('stacks a remote credit over your own undo, both clear of the card', async ({ page }) => {
    const room = await openRoom(page, 'start');

    await page.getByRole('button', { name: room.square(0).label }).tap();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

    await room.emit({
      seq: 501,
      kind: 'CALL',
      actorPlayerId: 'long-id',
      squareId: room.square(5).id,
    });

    await expect(credit(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

    await expectClearOfTheCard(page, credit(page), 'the spotter credit');
    await expectClearOfTheCard(page, undoRow(page), 'the undo row');
    await expectNoRowClipped(credit(page), 'the spotter credit');
    await expectNoHorizontalScroll(page);
  });

  /**
   * #13's own criterion: a call landing must not shift the grid. Measured as the
   * card's box before and after, because "the layout did not move" is the claim and a
   * screenshot of a toast is not evidence for it.
   */
  test('does not shift the grid when a call lands', async ({ page }) => {
    const room = await openRoom(page, 'start');

    const before = await page.getByLabel('Your card').boundingBox();

    await room.emit({
      seq: 502,
      kind: 'CALL',
      actorPlayerId: 'guest-id',
      squareId: room.square(9).id,
    });
    await expect(credit(page)).toBeVisible();

    expect(await page.getByLabel('Your card').boundingBox()).toEqual(before);
  });

  /**
   * The other half of the same claim, and the one #13 words as "no scroll trap when
   * the sheet is open mid-call": with the list open *and* the slot full, the race is
   * still reachable and the page has not trapped the thumb on a surface it cannot
   * leave.
   */
  test('leaves the race reachable with the list open and the slot full', async ({ page }) => {
    const room = await openRoom(page, 'mid');

    await page.getByRole('button', { name: /What am I looking for/ }).tap();
    await room.emit({
      seq: 503,
      kind: 'CALL',
      actorPlayerId: 'guest-id',
      squareId: room.square(20).id,
    });
    await expect(credit(page)).toBeVisible();

    await page.getByRole('tab', { name: 'Race' }).tap();
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

/**
 * The host's admin surface, re-gated because it now sits inside C1's card column
 * rather than being the whole page. #10 gated its 40 rows; what is new is the toggle
 * back and the amber chrome living beside a segmented control.
 */
test.describe('the host deck sheet', () => {
  test('lists the whole deck, and the way back is thumb-sized', async ({ page }) => {
    await openRoom(page, 'mid');

    const toggle = page.getByRole('button', { name: 'Host deck sheet' });
    await expectThumbSized(toggle, 'the deck sheet toggle');
    await toggle.tap();

    await expectNoHorizontalScroll(page);
    await expectThumbSized(
      page.getByRole('button', { name: 'Back to your card' }),
      'the way back to the card',
    );

    await page.getByRole('button', { name: 'Back to your card' }).tap();
    await expect(page.getByLabel('Your card')).toBeVisible();
  });
});
