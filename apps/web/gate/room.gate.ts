import { expect, test, type Locator, type Page } from '@playwright/test';
import { CARD, openRoom } from './room-fixture';
import {
  expectBesideTheCard,
  expectClearOfTheCard,
  expectNoCellClipped,
  expectNoHorizontalScroll,
  expectNoRowClipped,
  expectNoVerticalScroll,
  expectThumbSized,
  expectWholeOnScreen,
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
 * Which of the two layouts this project's viewport gets. The switch is pure CSS at
 * Tailwind's stock `lg` (1024px), so the viewport is the whole of it — and
 * `ipad-11-landscape` (1194) is the only matrix viewport at or above it. #14's own
 * criterion puts `ipad-11-portrait` (834) on the phone layout deliberately: a
 * comfortable single column with the larger cells.
 *
 * Tests written for one layout say so rather than being weakened to pass in both.
 */
const twoPane = () => test.info().project.name === 'ipad-11-landscape';

/**
 * The spotter credit, located as the toast rather than by its words. `getByText(/
 * spotted/)` cannot be used here: the timeline is a list of the same sentence, so it
 * matches thirteen rows on a mid-race card and the one that matters is the only one
 * that is not in a list.
 *
 * Scoped out of the share dialog since #88, which carries a live region of its own
 * for its copy feedback. That one is never painted at the same time as this — a
 * closed `<dialog>` is `display: none` — but it is in the document, and a bare
 * `p[role="status"]` is two elements the moment it is.
 */
const credit = (page: Page) => page.locator('p[role="status"]:not(dialog p)');

/**
 * The tab that puts the standings and the timeline up, in whichever layout is on:
 * the phone's `Race` surface, or the right pane's `Race` tab. Two tab widgets are in
 * the document at every width — only one is ever painted — so each is named
 * distinctly rather than located by position.
 */
const raceTab = (page: Page): Locator =>
  page.getByRole('tab', { name: twoPane() ? 'Race pane' : 'Race' });

/**
 * And the panel that tab reveals — the results themselves in both layouts, not the
 * surface that holds them. `Race` names the surface, which at phone widths also
 * contains the right pane's own list; measuring `li` rows in there swept up 24 hidden
 * rows, and hidden rows measure clean, so the assertion would have passed with the
 * standings rendering nothing at all.
 */
const racePanel = (page: Page): Locator =>
  page.getByRole('tabpanel', { name: 'Race pane' });

/** The undo row itself, not the span inside it — the row is what covers or does not. */
const undoRow = (page: Page): Locator => page.getByText(/^Called /).locator('xpath=..');

/** The slim bar, however this document happens to expose it. */
const slimBar = (page: Page): Locator =>
  page.getByRole('banner').or(page.locator('header')).first();

/**
 * "One line" said as a measurement, because nothing else here can see it: a wrapped
 * row is not clipped, does not scroll the page and does not overflow anything — it
 * just quietly takes a second line out of the card's own height. #88's Share room
 * trigger did exactly that at both phone widths, wrapping the heading *and* the
 * statistics and taking the bar from 44px to 69px, and every other assertion on the
 * bar stayed green. Compared against each row's own computed `line-height` rather
 * than a pixel constant, so a type-scale change does not have to come back here.
 *
 * Only `h1` and `> p` — the dice slot, the Theme button and Share are all single-line
 * by construction (a `<button>` with no wrapping content), so a line count is not a
 * meaningful thing to ask of them, and `expectThumbSized`/`expectNoHorizontalScroll`
 * cover them instead.
 *
 * Lifted out of the test it was written in (#103) so that more than one stats line
 * can be counted by the same instrument, and so that a caller can reach it without
 * a copy assertion above it aborting the test first — see the worst-case test below.
 */
async function expectHeaderOnOneLine(bar: Locator) {
  for (const row of ['h1', '> p']) {
    const lines = await bar.locator(row).first().evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.height / parseFloat(getComputedStyle(node).lineHeight);
    });
    expect(lines, `the slim bar's ${row} holds one line`).toBeLessThanOrEqual(1.01);
  }
}

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

    /*
      And the same ratio against the cell, which is the assertion that says the type
      did not outrun the cell it sits in.

      **`expect(wide.cell).toBeGreaterThan(narrow.cell * 1.5)` used to stand here and
      is deliberately gone rather than nudged.** It was a fact about a layout where the
      card was the width of the viewport; two panes make the landscape card 557px
      against a narrow 382px, so the cell goes 73px to 108px — 1.48, and it failed on
      geometry rather than on a defect.

      What replaced it first was worse than nothing: "the cell is the same fraction of
      the card at both widths" is *true by construction* for a `grid-cols-5 gap-1`
      grid, at every width, defect or no defect. A tautology in the place of a real
      assertion is how this file's history keeps repeating itself, so it is written
      down rather than quietly deleted.

      The load is carried by the `font / card` band above, asserted at *two* widths —
      re-seeded and confirmed: with #47 back (`clamp(0.5rem,1.7vw,0.8rem)` behind a
      `max-w-md` page) the narrow reading is 8px in a 382px card, 0.021, outside the
      band. That is the mechanism, and a clipping check still cannot see it.
    */
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
  /**
   * #103's rewrite of the same claim. The mark count is `n/24` rather than
   * "n marks" (shorter, to buy back the width the dice slot and the Theme
   * button now cost), and "· <rung> next" moved into a `hidden lg:inline` span
   * — present only at `ipad-11-landscape`, the one viewport with room for the
   * full sentence, per this issue's own acceptance criterion.
   */
  test('says where you are without covering the card', async ({ page }) => {
    await openRoom(page, 'mid');

    // Mark count over the card's own 24, and who is here — both on one line at
    // 375 CSS px, which is the width that decides whether they fit.
    const bar = slimBar(page);
    await expect(bar).toContainText('/24');
    await expect(bar).toContainText('here');

    // The rung being played for is the one part of the sentence that is not
    // supposed to be on every viewport — asserted as visibility rather than as
    // text content, since `hidden` is a CSS `display: none` and the node is in
    // the document either way.
    const rung = bar.getByText(/next$/);
    if (twoPane()) {
      await expect(rung).toBeVisible();
    } else {
      await expect(rung).toBeHidden();
    }

    await expectNoRowClipped(bar.locator('p'), 'the slim bar');
    await expectNoHorizontalScroll(page);

    /*
      The `mid` stage's own line count. At `ipad-11-landscape` this is the longest
      the row ever gets — `12/24 · full house next · 6 here`, the only stage and
      viewport where the `hidden lg:inline` rung span is both populated and shown —
      so it is a worst case in its own right, and the `done` stage below is the
      worst case at the three viewports that drop the rung.

      This one sits behind the copy assertions above, which is a real limitation:
      Playwright aborts a test at its first failed `expect`, so a regression that
      changed the *words* would never reach this line. That is exactly why the
      worst-case count lives in a test of its own below, with nothing in front of it.
    */
    await expectHeaderOnOneLine(bar);
  });

  /**
   * Acceptance criterion 3 and the Gate bullet both say "with the worst-case stats
   * line", and the test above runs `mid` — `12/24 · 6 here` at the three viewports
   * that hide the rung. The worst line this fixture can produce there is the `done`
   * stage: every one of the 24 called, so `24/24 · 6 here`, two more tabular glyphs
   * than `mid` gates. Between the two tests the line count now runs against the
   * longest line each of the four viewports can actually render.
   *
   * A test of its own, and the line count is its *first* assertion, because that is
   * the only arrangement in which the wrapping instrument can be the thing that
   * fires. Sharing a test with the copy assertions meant a seeded regression that
   * touched the words aborted before the count ran — the count was reachable only
   * for regressions that widened the line without changing it, which is a narrower
   * set than the criterion. The presence checks the criterion also names follow the
   * count rather than preceding it, for the same reason: nothing about the page
   * changes between the two, so the order costs the claim nothing and buys the
   * measurement an unobstructed path.
   */
  test('holds one line at the worst-case stats line', async ({ page }) => {
    await openRoom(page, 'done');

    const bar = slimBar(page);
    await expectHeaderOnOneLine(bar);

    // Everything criterion 3 names, on the row that was just counted — a header
    // that fits because a control went missing is not the claim being made.
    await expect(bar.getByRole('heading', { name: 'Room ABCD' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Dice' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Theme' })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Share/ })).toBeVisible();
    await expect(bar).toContainText('24/24');

    await expectNoRowClipped(bar.locator('p'), 'the slim bar at its worst line');
    await expectNoHorizontalScroll(page);
  });

  /**
   * #103's header controls: the dice's reserved slot, whole and clear of any
   * overlap with its 44px neighbour, and the Theme button's *hit element* —
   * not its small visible box — meeting the 44px minimum.
   */
  test('holds the dice slot and the Theme button beside the room code and Share', async ({
    page,
  }) => {
    await openRoom(page, 'mid');

    const bar = page.getByRole('banner').or(page.locator('header')).first();
    const dice = bar.getByRole('button', { name: 'Dice' });
    const theme = bar.getByRole('button', { name: 'Theme' });

    await expect(dice).toBeVisible();
    await expect(dice).toBeDisabled();
    await expectThumbSized(theme.locator('[data-hit-expand]'), "the Theme button's hit element");

    /*
      Two 44px hit targets cannot overlap — the whole reason the stats line had to
      come down in the first place.

      Read what this does and does not currently claim, slice 7. It compares the
      dice slot's *visible* box against the Theme button's *hit* box, and the Theme
      button's expander is `max(100%, 44px)` on each axis against a box that is
      already wider than 44px — so its width collapses to the button's own, the two
      rectangles are held apart by this row's `gap-2` by construction, and this
      assertion cannot fail as the row stands. It is not the wrong assertion; it is
      the right one with only one real expander in the row to point at.

      It was left this way on purpose rather than strengthened here: the reserved
      slot's visible box is ~26px (`aspect-square` against `items-stretch`), so a
      44×44 expander centred on it bleeds ~9px per side into an 8px gap, and the
      die's box and its expander are slice 7's to land (this issue's brief:
      "reserve the dice's slot but do not build the dice"). When slice 7 gives the
      die its own expander, assert *both* expanders against each other here — that
      is the pair this check was written for, and it will have something to catch.
    */
    const diceBox = (await dice.boundingBox())!;
    const themeBox = (await theme.locator('[data-hit-expand]').boundingBox())!;
    const overlaps =
      diceBox.x < themeBox.x + themeBox.width &&
      diceBox.x + diceBox.width > themeBox.x &&
      diceBox.y < themeBox.y + themeBox.height &&
      diceBox.y + diceBox.height > themeBox.y;
    expect(overlaps, 'the dice slot and the Theme button`s hit target overlap').toBe(false);

    await expectNoHorizontalScroll(page);
  });

  /**
   * The acceptance criterion that a screenshot cannot answer: pressing the
   * button re-skins the surface *without* tearing down the live game's SSE
   * connection. Driven at `phone`, four presses in a row (one full turn of the
   * fixed cycle), and proven by more than "the colour changed" — a frame
   * pushed down the stream after the presses still has to land as a fresh
   * timeline entry, which only happens if the same `EventSource` is still open.
   */
  test('re-skins across four presses without dropping the stream', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'this criterion names `phone` only');

    const room = await openRoom(page, 'start');
    const theme = page.getByRole('button', { name: 'Theme' });

    const cycle = ['slipstream', 'confetti', 'scorecard', 'pitwall'];
    for (const expected of cycle) {
      await theme.tap();
      await expect(page.locator('html')).toHaveAttribute('data-skin', expected);
    }

    // The stream is still the one this page opened at the start — no remount
    // happened along the way.
    expect(await room.streams(), 'streams opened across four presses').toBe(1);

    // And it still delivers: a CALL pushed now has to reach the timeline, which
    // it cannot do over a torn-down connection.
    await raceTab(page).tap();
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();

    /*
      Scoped to the timeline's own rows, and asserted as growth from a baseline.
      This was `expect(racePanel(page).locator('li')).not.toHaveCount(0)`, which
      could not fail: the panel also carries the Standings `<ol>`, which renders
      one `<li>` per roster player — six, for this fixture — unconditionally at
      every stage, so the assertion was already true before the emit and stayed
      true with the `EventSource` dead. `getByText(/ spotted /)` matches only
      timeline rows (the app writes that credit nowhere else inside this panel),
      and a delivered frame is the only thing that can add one, so a baseline
      taken here and a count taken after is a claim about the stream rather than
      about the roster.

      At `start` the baseline is zero — the timeline renders `Nothing called yet.`
      as a bare `<p>` — but it is read rather than assumed, so this keeps working
      if the stage this test opens ever changes.
    */
    const spotted = racePanel(page).getByText(/ spotted /);
    const before = await spotted.count();

    await room.emit({
      seq: 701,
      kind: 'CALL',
      actorPlayerId: 'guest-id',
      squareId: room.square(15).id,
    });

    await expect(spotted, 'the emitted CALL reached the timeline').toHaveCount(before + 1);
  });

  /**
   * C1's departure from D14 as first written: no swipe-up sheet and no gesture, two
   * whole surfaces and a segmented control. So what is gated is that the tabs are
   * reachable by thumb and that neither surface covers the other.
   */
  test('switches surfaces by tap, and comes back to the card unmoved', async ({ page }) => {
    // There is no Card/Race control in the two-pane layout, because both are up at
    // once — `the two panes` below is the same claim for that layout.
    test.skip(twoPane(), 'the phone layout only');
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
    await raceTab(page).tap();

    await expectNoRowClipped(racePanel(page).locator('li'), 'the race panel');
    await expectNoHorizontalScroll(page);
  });
});

/**
 * #14's layout, and the only viewport in the matrix that gets it. An 11" iPad on its
 * side is plausibly the *primary* device — propped next to the TV — so this is a
 * first-class layout rather than a wide phone.
 *
 * Two of #14's own acceptance criteria are answered differently here on purpose, and
 * both departures are recorded on the issue:
 *
 * - **The right pane is tabbed, not permanently split.** #12's C1 traded permanent
 *   standings for **Looking for | Race** opening on the list, and named the cost;
 *   #14's body says to follow the prototype.
 * - **No inline `description` in the cell.** The pool licences prose to ~130
 *   characters against a ~162px cell, so it does not fit. The list is the answer to
 *   the same need, which is what #12 built it for.
 */
test.describe('the two panes', () => {
  test.beforeEach(() => {
    test.skip(!twoPane(), 'the two-pane layout is `lg` and above');
  });

  /** The right pane's list, named by the tab that carries its count. */
  const listPane = (page: Page): Locator =>
    page.getByRole('tabpanel', { name: /Looking for/ });

  test('puts both columns up at once, neither covering the other', async ({ page }) => {
    await openRoom(page, 'mid');

    await expect(page.getByLabel('Your card')).toBeVisible();
    await expect(listPane(page)).toBeVisible();
    /*
      Beside the card and covering none of it — two assertions rather than one, and
      that is a seeded regression talking. Stacking the columns (`lg:flex-col` on the
      row) covers nothing either, so `expectClearOfTheCard` alone passed the phone
      layout with extra steps. `expectBesideTheCard` is the claim actually being made.
    */
    await expectBesideTheCard(page, listPane(page), 'the right pane');
    await expectClearOfTheCard(page, listPane(page), 'the right pane');

    // And none of the phone layout's chrome came with it: no Card/Race control, and
    // no accordion under the card, which would be a second way to read one list.
    await expect(page.getByRole('tablist', { name: 'Room' })).toBeHidden();
    await expect(
      page.getByRole('button', { name: /What am I looking for/ }),
    ).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('opens on the list, and changing pane never moves the card', async ({ page }) => {
    await openRoom(page, 'mid');

    const looking = page.getByRole('tab', { name: /Looking for/ });
    await expectThumbSized(looking, 'the Looking for tab');
    await expectThumbSized(raceTab(page), 'the Race tab');
    // Early in a race what you want is what to watch for, not a timeline of things
    // that already happened. So the pane opens on the list rather than on the race.
    await expect(looking).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Standings' })).toBeHidden();

    const before = await page.getByLabel('Your card').boundingBox();

    await raceTab(page).tap();
    await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    await expect(listPane(page)).toBeHidden();

    // The left column is the card and only the card, so a tap on the right must not
    // move it by a pixel — that is the whole reason the card lives in its own column.
    expect(await page.getByLabel('Your card').boundingBox()).toEqual(before);
    await expectNoRowClipped(racePanel(page).locator('li'), 'the right pane');
    await expectNoHorizontalScroll(page);
  });

  /**
   * The count is the phone accordion's job done by a tab caption, so it is gated the
   * same way: the list's worst case at lights out, and empty at a full house.
   */
  test('carries all 24 open squares at lights out, none of them clipped', async ({ page }) => {
    await openRoom(page, 'start');

    await expect(page.getByRole('tab', { name: 'Looking for 24' })).toBeVisible();
    const rows = listPane(page).locator('li');
    await expect(rows).toHaveCount(24);
    await expectNoRowClipped(rows, 'the open squares list');
    await expectNoHorizontalScroll(page);
  });

  test('empties out as the card fills, and says so', async ({ page }) => {
    await openRoom(page, 'done');

    await expect(page.getByRole('tab', { name: 'Looking for 0' })).toBeVisible();
    // Not a blank half of the screen. The accordion can get away with an empty list
    // because it is shut and its heading reads `(0)`; a pane that opens by default
    // cannot, and this asserts the words rather than only the count on the tab.
    await expect(listPane(page)).toContainText('Nothing left to look for');
  });

  /**
   * The defect this run shipped and the gate did not see, so it gets two assertions
   * of its own: the page must not scroll at all, and scrolling the list must leave the
   * card where it was.
   *
   * The mechanism, because it is not obvious from the markup: the screen was
   * `min-h-dvh`, a *minimum*, so the row holding the two columns had no definite
   * height, `flex-1` panes grew to their content, and their `overflow-y-auto` never
   * engaged. At lights out that made the pane 1427px tall and the document scroll
   * 742px — the card leaves the screen when you read the list, which is precisely what
   * two columns are for. Nothing in the gate measured vertical scroll.
   */
  test('scrolls the list inside its own pane, never the page', async ({ page }) => {
    await openRoom(page, 'start');

    await expectNoVerticalScroll(page, '24 open squares in the right pane');

    const before = await page.getByLabel('Your card').boundingBox();
    const scrolled = await listPane(page).evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight;

      return pane.scrollTop;
    });

    // The pane really did scroll — otherwise "the card did not move" would be true
    // for the wrong reason, which is the shape of half the defects in this file.
    expect(scrolled, 'pixels the right pane scrolled').toBeGreaterThan(0);
    expect(await page.getByLabel('Your card').boundingBox()).toEqual(before);
    await expectNoVerticalScroll(page, 'the right pane scrolled to its end');
  });

  /**
   * The host's 40-row deck sheet, which lands in the *card* column — the one place
   * the left column carries something taller than the card. The prototype could drop
   * that column's scroller at `lg`; the real screen cannot.
   */
  test('keeps the host deck sheet inside the card column', async ({ page }) => {
    await openRoom(page, 'mid');

    await page.getByRole('button', { name: 'Host deck sheet' }).tap();
    await expect(page.getByRole('button', { name: 'Back to your card' })).toBeVisible();

    // Both columns are still up — the sheet takes the card's place, not the screen —
    // and 40 rows went into the column's own scroller rather than onto the page.
    await expect(listPane(page)).toBeVisible();
    await expectNoVerticalScroll(page, 'the deck sheet open beside the right pane');
    await expectNoHorizontalScroll(page);
  });

  /**
   * #14's rotation criterion, driven rather than reasoned about. An iPad next to a TV
   * gets turned mid-race, and the two things that must survive it are the game's
   * state and the stream.
   *
   * The stream is why the layout switch is CSS and not `matchMedia`: `RoomScreen`
   * stays one mounted element across the rotation, so the subscription is never torn
   * down. A remount would re-freeze the stream's `horizon` and replay the whole log
   * as fresh toasts — which is why "exactly one stream, across the whole run" is the
   * assertion rather than "a stream is open".
   */
  test('survives a rotation with its state and its stream', async ({ page }) => {
    const room = await openRoom(page, 'start');

    await raceTab(page).tap();
    const square = page.getByRole('button', { name: room.square(0).label });
    await square.tap();
    await expect(square).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

    // Upright, which is the phone layout, and back onto its side.
    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page.getByRole('tablist', { name: 'Room' })).toBeVisible();
    await expect(square).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({ width: 1194, height: 834 });

    // The mark, the still-open undo window, and which pane was up — all three are
    // state a remount would have taken with it.
    await expect(square).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(raceTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible();

    expect(await room.streams(), 'streams opened across the rotation').toBe(1);
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
  // The accordion is the phone layout's shape for the list. In the two-pane layout it
  // has a tab of its own instead, gated in `the two panes` below. Asked in a
  // `beforeEach` rather than at describe scope because `test.info()` — which is how a
  // test learns its own viewport — only exists once a test is running.
  test.beforeEach(() => {
    test.skip(twoPane(), 'the phone layout only');
  });

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

    // Open the list, in whichever shape this layout gives it: the accordion under the
    // card, or the right pane's own tab — which opens on the list already.
    if (twoPane()) {
      await page.getByRole('tab', { name: /Looking for/ }).tap();
    } else {
      await page.getByRole('button', { name: /What am I looking for/ }).tap();
    }
    await room.emit({
      seq: 503,
      kind: 'CALL',
      actorPlayerId: 'guest-id',
      squareId: room.square(20).id,
    });
    await expect(credit(page)).toBeVisible();

    await raceTab(page).tap();
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

  /**
   * #46's correction, and the first committed measurement of D8's dialog. It is gated
   * here rather than beside the card because the sheet is where the dialog is now
   * *only* reachable from: the ~16 deck squares no card of the host's holds can be
   * called and taken back nowhere else, so this is the surface it has to be whole over.
   *
   * The dialog is a `fixed inset-0` layer over a 40-row scroller, which is why it is
   * measured with `expectWholeOnScreen` rather than the bottom slot's
   * `expectClearOfTheCard` — there is no card on screen to be clear of, and scrolling
   * the sheet behind it does not bring a button below the fold into reach.
   */
  test('takes a called deck row back, with the dialog whole over the sheet', async ({
    page,
  }) => {
    await openRoom(page, 'mid');
    await page.getByRole('button', { name: 'Host deck sheet' }).tap();

    // A deck square that is on no card, so the card could not reach this call at all.
    const row = page
      .getByLabel('Host deck sheet')
      .getByRole('button', { name: /Investigation into a stop/ })
      .first();

    await row.tap();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expectThumbSized(row, 'the called deck row');

    // Past the ten-second window this is the only affordance left for it, so the row
    // itself is what opens the dialog.
    await row.tap();

    const dialog = page.getByRole('dialog');
    const back = dialog.getByRole('button', { name: 'Take it back' });
    const keep = dialog.getByRole('button', { name: 'Keep it' });

    await expectWholeOnScreen(page, dialog.locator('> div'), 'the retract dialog');
    await expectThumbSized(back, 'the dialog`s Take it back');
    await expectThumbSized(keep, 'the dialog`s Keep it');
    await expectNoRowClipped(dialog.locator('p'), 'the dialog prose');
    await expectNoHorizontalScroll(page);

    // Reachable has to mean the call comes back, not that the button rendered.
    await back.tap();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(row).toHaveAttribute('aria-pressed', 'false');
  });
});


/**
 * #87's re-roll, which is a layout claim before it is anything else: the offer sits
 * directly *beneath* the grid, so the grid itself never moves when the first call
 * withdraws the button — `does not shift the grid when a call lands` above is the
 * regression guard for that, and is expected to stay green untouched. The slot is
 * still reserved permanently so that what sits below it does not jump either.
 */
test.describe('re-rolling a clean card', () => {
  const rerollButton = (page: Page) =>
    page.getByRole('button', { name: 'Re-roll card' });

  test('offers a clean card a re-roll a thumb can hit', async ({ page }) => {
    await openRoom(page, 'start');

    const button = rerollButton(page);
    await expect(button).toBeVisible();
    // Beneath the card and still whole on screen — a real assertion at
    // `phone-small`, where the grid runs most of the way to the bottom.
    await expectThumbSized(button, 'the re-roll button');
    await expectWholeOnScreen(page, button, 'the re-roll button');
    await expectNoHorizontalScroll(page);
  });

  /**
   * The consequence ADR-0006 attaches to a re-roll, now stated beside the button
   * rather than gating it (#87 asks for the action to be immediate). It is prose in
   * flow, so what a browser has to say about it is that no line of it is clipped.
   */
  test('states the consequence without clipping a line of it', async ({ page }) => {
    await openRoom(page, 'start');

    const consequence = page.locator('#reroll-consequence');
    await expect(consequence).toBeVisible();
    await expectNoRowClipped(consequence, 'the re-roll consequence');
    await expectWholeOnScreen(page, consequence, 'the re-roll consequence');
    await expectNoHorizontalScroll(page);
  });

  /**
   * The replacement card, measured. It is 24 labels no run has ever graded — which
   * is the whole reason the fixture deals a different worst-case set rather than the
   * same one back.
   */
  test('deals a replacement card whose cells clip nothing', async ({ page }) => {
    const room = await openRoom(page, 'start');

    await rerollButton(page).tap();

    // The swap has happened when a square the old card held is gone.
    await expect(page.getByRole('button', { name: CARD[0]!.label })).toHaveCount(0);
    await expectNoCellClipped(page);
    await expectNoHorizontalScroll(page);

    // The replacement view is applied in place rather than remounting the screen,
    // so the stream this browser was already holding is the one it still holds.
    expect(await room.streams()).toBe(1);
  });

  test('offers no re-roll on a card a call has marked', async ({ page }) => {
    await openRoom(page, 'mid');

    await expect(rerollButton(page)).toHaveCount(0);
  });

  test('offers no re-roll once the game is done', async ({ page }) => {
    await openRoom(page, 'done');

    await expect(rerollButton(page)).toHaveCount(0);
  });

  /** No card on screen behind the sheet, so there is nothing there to re-roll. */
  test('offers no re-roll while the deck sheet is up', async ({ page }) => {
    await openRoom(page, 'start');

    await page.getByRole('button', { name: 'Host deck sheet' }).tap();
    await expect(rerollButton(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Back to your card' }).tap();
    await expect(rerollButton(page)).toBeVisible();
  });

  /**
   * The two-pane layout's promise, with a row of chrome the card column did not have
   * before: both columns still side by side, and the page still does not scroll.
   */
  test('keeps both columns up with the offer on screen', async ({ page }) => {
    test.skip(!twoPane(), 'a two-pane claim');

    await openRoom(page, 'start');
    await expect(rerollButton(page)).toBeVisible();

    // The pane opens on the list, so that is the one that is up beside the card.
    const pane = page.getByRole('tabpanel', { name: /Looking for/ });
    await expectBesideTheCard(page, pane, 'the right pane');
    await expectNoVerticalScroll(page, 'the re-roll offer up');
  });
});

/**
 * D12's confetti, and the one thing about it that needs a browser: it is the only
 * surface in the app that is *not* docked in flow. Every other bottom-slot claim in
 * `docs/SURFACES.md` is satisfied by the layout; this one is satisfied by
 * `canvas-confetti` appending its own `position: fixed; pointer-events: none`
 * canvas to `body` and taking it away again — which is a property of a library, and
 * therefore a property to assert rather than to trust.
 */
test.describe('a prize landing', () => {
  test('bursts over the card without covering it or catching a tap', async ({ page }) => {
    const room = await openRoom(page, 'mid');

    const calls: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/call')) calls.push(request.postData() ?? '');
    });

    const before = await page.getByLabel('Your card').boundingBox();

    await room.emit({
      seq: 601,
      kind: 'PRIZE',
      actorPlayerId: 'guest-id',
      prizeKind: 'LINE',
    });

    const burst = page.locator('canvas');
    await expect(burst).toHaveCount(1);

    // The two properties the whole design rests on, read off the real element.
    expect(
      await burst.evaluate((canvas) => getComputedStyle(canvas).pointerEvents),
    ).toBe('none');
    expect(
      await burst.evaluate((canvas) => getComputedStyle(canvas).position),
    ).toBe('fixed');

    // Nothing moved: the canvas is out of flow, so the grid is where it was.
    expect(await page.getByLabel('Your card').boundingBox()).toEqual(before);

    // And a cell tapped mid-burst still calls for the room, which is the half of
    // "does not block interaction" that a computed style cannot answer.
    const square = page.getByRole('button', { name: room.square(20).label });
    await square.tap();
    await expect(burst).toHaveCount(1);
    await expect(square).toHaveAttribute('aria-pressed', 'true');
    expect(calls, 'a tap during a burst must reach the room').toHaveLength(1);

    await expectNoHorizontalScroll(page);
  });
});

/**
 * The share link is the primary join path and it mostly gets pasted into a group
 * chat, so the unfurl is most players' first sight of the room.
 *
 * The half of it that is gateable is the half that fails silently: an `og:image`
 * that is relative unfurls as a bare link on every machine but this one, and the
 * image route is the only place in the app that fetches the API from the server.
 * This run has no API at all — `playwright.config.ts` builds and serves against
 * `http://api.gate.invalid` — so what passes here is specifically the fallback
 * card, which is the path a slow or down API takes in production.
 */
test.describe('the unfurl for a share link', () => {
  test('carries the room code, and draws a card with no API to ask', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/r/ABCD');

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Room ABCD',
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );

    // An unfurler is a different machine, so a relative image URL is a link with
    // no card — this is what `metadataBase` is for and the only way to see it.
    const image = await page
      .locator('meta[property="og:image"]')
      .getAttribute('content');
    expect(image, 'og:image must be absolute').toMatch(/^https?:\/\//);

    const card = await request.get(image!);
    expect(card.status(), 'the card must render with the API unreachable').toBe(200);
    expect(card.headers()['content-type']).toContain('image/png');

    /*
      The canonical tag and the OG URL name the same origin the image does — one
      resolved origin per request (`app/site-origin.ts`), or a room has three
      names and a crawler picks one. This run sets no `SITE_URL`, so what passes
      here is specifically the request-origin branch: the one every preview and
      every laptop takes. The production override is covered in
      `test/site-origin.test.ts`, which needs no build of its own.
    */
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${baseURL}/r/ABCD`,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      `${baseURL}/r/ABCD`,
    );
    expect(image, 'the image must share that origin').toContain(
      `${baseURL}/r/ABCD/opengraph-image`,
    );
  });
});
