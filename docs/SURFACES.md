# Visual surfaces

The registry of this project's visual surfaces: what screens exist, what widths they must
survive, and the gate that proves it. `/wrapup`'s visual-verification step reads this file, maps a
session's diff against it, and runs the listed gate for each affected surface scoped to the
affected screens.

It exists because four of #4's acceptance criteria were layout claims that no test could check, so
they went machine-unverified and were signed off by eye. #12–#14 are all layout work and would hit
the same wall.

## Devices this project actually targets

Phones and 11-inch iPads, held in one hand while a race is on. Not desktop — a desktop browser is
a development convenience, never a target. From `CLAUDE.md`: *"played on phones and 11" iPads while
watching motorsport."*

## Matrix

Every web surface is gated at these four viewports. Names are the ones to use in gate output and in
issue acceptance criteria, so a criterion can say "at `phone-small`" and mean something exact.

| Name                 | Size (CSS px) | Stands for                                    |
| -------------------- | ------------- | --------------------------------------------- |
| `phone-small`        | 375 × 667     | iPhone SE — the tightest width worth support  |
| `phone`              | 390 × 844     | iPhone 15 / 14 / 13, the common case          |
| `ipad-11-portrait`   | 834 × 1194    | iPad Pro 11" upright                          |
| `ipad-11-landscape`  | 1194 × 834    | iPad Pro 11" on its side — #14's two-pane case |

Dark is the only theme (`globals.css` is bare Tailwind v4 and the components hardcode
`neutral-900`/`neutral-700`); there is no light-mode gate until a light mode exists.

## Surface: web

- **Code root:** `apps/web/app/`
- **Toolset:** Playwright, in the repo since #13. Never `chrome --headless --screenshot` — the
  viewport renders at the wrong size and the captures lie.
- **Gate:** `pnpm --filter @twinion-bingo/web run gate`. Lives in `apps/web/gate/`, runs in CI as
  the `gate` job, and needs no API and no database — it intercepts every call the app makes.
  See `apps/web/gate/room-fixture.ts` for what that buys and what it costs.
- **How to add to it:** `apps/web/gate/measure.ts` holds the instruments and each one carries the
  name of the earlier run it was written against. Reach for those rather than writing a fresh
  assertion; the history in this file is mostly a history of measuring the wrong thing.

### Screens

| Screen                | Route / state                                    | What the capture has to show                                                                                             |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Home                  | `/`                                              | The two stacked forms ("Start a room", "Join with a code") both reachable without scrolling past one; the API health line |
| Room — needs a name   | `/r/:code`, roster `you === null`                | The name form and heading fit; the disabled/enabled button state is legible                                               |
| Room — roster         | `/r/:code`, joined                               | The room code heading, **the share link wrapping rather than overflowing**, and the roster with `(host)` and `— you`      |
| Room — loading        | `/r/:code` before the roster resolves            | The single-line state does not shift the layout when it resolves                                                          |
| Room — missing        | `/r/:code` with an unknown code                  | "No room has the code XXXX." reads as an answer, not an error page                                                        |
| Room — unreachable    | `/r/:code` with the API down                     | Distinguishable from "missing" at a glance                                                                                |
| Room — host lobby     | `/r/:code`, joined as the host, no game yet      | The **Start game** button below the roster, reachable without scrolling past the share link                                |
| Game — card           | `/r/:code`, a live game, this player dealt in    | The **5x5 card**: 25 square cells, the free centre reading "LIGHTS OUT", and every label legible and unclipped in its cell |
| Game — marked card    | `/r/:code`, a live game with squares called      | Marked cells telling apart from unmarked ones at a glance, and still unclipped — a marked label is bolder, so a label that fit unmarked has to be re-checked marked |
| Game — spotter toast  | `/r/:code`, just after a CALL arrives            | The toast **docked below the card** crediting the spotter by name — docked in flow since #13, not pinned over the card, so **covering no part of the card** is a property of the layout rather than a measurement to re-take — and wrapping rather than overflowing on a long name plus a 30-character label |
| Game — prizes         | `/r/:code`, a game with rungs of the ladder won  | The **Prizes** list under the card: each rung named in words ("first line", "two lines", "full house") against its winner, and co-winners of one rung as separate lines |
| Game — standings      | `/r/:code`, a live game with calls in it         | The **Standings** list: every player's name against a right-aligned raw mark count, the name truncating rather than pushing the number off the row on a 24-character name |
| Game — final standings| `/r/:code`, `state === 'done'` after a full house | The same list headed **Final standings** rather than **Standings**, so the room can tell a finished game from a live one without reading the card |
| Game — timeline       | `/r/:code`, a game with calls in it              | The **Timeline**, newest first: a fixed-width `+MM:SS` stamp column that stays a column, with each row's text wrapping *within its own column beside the stamp* rather than running under it |
| Game — late joiner    | `/r/:code`, joined mid-game, a line already up   | The card's **greyed** inherited marks reading as distinct from both an earned (emerald) mark and an unmarked cell at a glance — a line already complete at join must not look claimable |
| Game — results under the toast stack | `/r/:code`, a local undo open *and* a remote credit arriving, over a populated results panel | Both bottom rows stacked and unclipped, neither covering the card, and the timeline still reachable by scrolling out from under them |
| Game — host deck sheet | `/r/:code`, a live game, joined as the host, sheet open | All 40 deck rows, called ones telling apart from uncalled at a glance, **the amber admin chrome distinguishing the sheet from the host's own card**, and the toggle back to the card reachable |
| Game — undo toast     | `/r/:code`, within 10s of **your own** call      | The toast **docked below the card** naming the square you called with the **Undo** button beside it — the button on the toast rather than below it, thumb-sized, and neither the label nor the button overflowing on a 30-character label; **covering no part of the card**. Tap it — "reachable" has to mean the square unmarks, not that the button rendered. The host's own call from the deck sheet opens the same window, so the toast has to sit over the sheet without hiding a row's Call affordance |
| Game — credit over undo | `/r/:code`, a remote CALL arriving while your own undo window is open | **Both rows on screen at once** — the spotter credit stacked above the undo row rather than replacing it — still docked, still **covering no part of the card**, and the **Undo** button still reachable beneath the credit |
| Game — retract dialog | `/r/:code`, tapping a marked square you may correct | The confirmation centred over the dimmed card: the prose naming the square and saying it unmarks for everyone, with **Take it back** and **Keep it** both on screen without scrolling, and both **thumb-sized (44px)** — they were 24px until #46 measured them |
| Game — retract dialog over the sheet | `/r/:code`, the host tapping a **called** row of the deck sheet | The same confirmation over the 40-row sheet rather than the card — so nothing here can be said as "clear of the card", and the panel has to be **whole inside the viewport** while the scroller behind it is three screens tall. The prose **names the square**, which only works because the host holds the deck's prose; and the row it was opened from goes back to uncalled once **Take it back** is tapped. This is the only surface that reaches a call on one of the ~16 deck squares that are on no card of the host's |
| Game — slim bar       | `/r/:code`, a live game                          | One line carrying **your mark count, the rung being played for, and the roster size** (not presence — see #67) — all three fitting at 375 CSS px beside the room code, and the rung dropping out rather than reading "full house next" once the ladder is spent |
| Game — the two surfaces | `/r/:code`, tapping `Card` and `Race` — the **phone layout**, so `phone-small`, `phone` and `ipad-11-portrait` | The segmented control **thumb-sized (44px)**, each surface whole and neither covering the other, and the card's box **identical to the pixel** after a round trip through the Race tab — both panels stay mounted, so a lost scroll position or a re-measured grid is a defect |
| Game — race surface   | `/r/:code`, `Race` up on a game with calls in it | Prizes, standings and timeline at full column width, no row overflowing its own box on a 24-character display name |
| Game — a square's prose | `/r/:code`, a card cell held down for 400ms    | D4's `description` in the docked slot, **covering no part of the card**, gone on release — and the release **not** also calling the square, which is the way this can go wrong that no screenshot shows. Drive it with a **second pointer on another cell** too: a resting thumb on a one-handed card once turned the hold into a call for the whole room |
| Game — what am I looking for | `/r/:code`, the block under the card, open at lights out (phone layout) | All **24** rows and their prose (to ~130 characters, #12's licence) with none overflowing, the toggle thumb-sized and its count reading while the block is shut, and the count falling to `(0)` at a full house |
| Game — two panes      | `/r/:code`, a live game, **`ipad-11-landscape` only** | **Both columns up at once**: the card alone on the left, the right pane beside it and **not intersecting it** (asserted as box intersection, like the bottom slot), and none of the phone layout's chrome — no `Card`/`Race` control, no accordion under the card |
| Game — the right pane's tabs | `/r/:code`, **`ipad-11-landscape` only**   | **Looking for _n_** and **Race**, both **thumb-sized (44px)**, **opening on Looking for** — the count on the tab reading 24 at lights out and 0 at a full house, no row of the open list overflowing its own box, and at a full house the pane **saying it is empty** rather than being blank while the final standings sit behind the other tab |
| Game — each pane scrolls itself | `/r/:code`, at `ipad-11-landscape`, 24 open squares in the right pane | **The page does not scroll vertically at all.** Scroll the list to its end and the card's box is unchanged — driven, and with the pane's own `scrollTop` asserted to have moved, or "the card did not move" passes for the wrong reason. The host's deck sheet is the same claim for the left column: 40 rows go into that column's scroller, not onto the page |
| Game — card unmoved across a pane switch | `/r/:code`, **`ipad-11-landscape`**, tapping **Race** in the right pane | The card's box **identical to the pixel** before and after. The left column is the card and only the card, so nothing that happens on the right may move it |
| Game — rotated mid-race | `/r/:code`, your own call just made, `ipad-11-landscape` → `ipad-11-portrait` → back | The mark, the still-open undo row and **which right-pane tab was up** all survive, and **exactly one stream is opened across the whole run** — the layout switch is CSS, so `RoomScreen` never remounts |
| Game — a prize landing | `/r/:code`, a PRIZE frame arriving on a live game | The burst playing while **the card's box is identical to the pixel**, and a cell tapped mid-burst still calling for the room. The only surface here that is not docked in flow: `canvas-confetti` owns the canvas and gives it `position: fixed; pointer-events: none`, so both halves are a library's property and are asserted rather than trusted |
| Legibility — the pool's worst 24 | `/legibility`, an inert card of the committed pool's 24 worst labels | Every real label **unclipped in its own cell**, and each one named below the card with its character count, its longest unbreakable run and its square id — so a label that fails by eye on real hardware maps straight to a `themes/f1/overrides.json` reword. The card is the room's geometry class for class, including the empty right column at `ipad-11-landscape`, or it would be judging a larger card than the room renders. The squares are picked by metric (`app/legibility/worst-labels.ts`), never by hand, so `pnpm pool:build` re-aims both the page and its gate |
| Install — the head of `/` | `/`, as a phone reads it before offering Add to Home Screen | A `link[rel=manifest]` and a `link[rel=apple-touch-icon]` that both fetch 200, a manifest whose `display` is `standalone` with 192/512/maskable icons that all resolve, and **no service worker registered** — a negative claim, so it is gated rather than written down (see the note in `app/manifest.ts` for why there is none) |
| Share — room unfurl | `/r/:code`, as a group-chat crawler reads it | The room code in `og:title`, an **absolute** `og:image` URL, and a 1200×630 image naming both the room code and its theme when the API is reachable; with the API unavailable, a code-only fallback still answering 200 `image/png` rather than collapsing to a bare link |

### Known-unverified claims inherited from #7

The card grid is the tightest layout in the project and the one that most needs the gate Playwright
will bring. Until then, verified by hand at the exact sizes:

- **The 5x5 grid at `phone-small`.** Cells are `aspect-square` in a `grid-cols-5` with `gap-1`, so a
  cell is roughly 68 CSS px at 375 wide. Labels run to 30 characters (`LABEL_MAX_CHARS`, set by this
  very constraint), and the font size is a `clamp()` on viewport width rather than a breakpoint —
  which is the thing to distrust, because clamp cannot know how many lines a label wraps to.
- **The longest label in the pool, not a representative one.** A gate that captures a card of short
  labels proves nothing; pick the pool's longest and confirm it neither clips nor pushes its cell.
- **`ipad-11-landscape`**, where the grid has width to spare and the risk inverts: cells growing
  wide enough that the card stops reading as a square block.

**Settled by #8's gate run** (Playwright, `page.setViewportSize`, all four viewports, three card
states each, with a per-cell `scrollHeight`/`scrollWidth` assertion rather than an eyeball):

- No cell clipped at any viewport, marked or unmarked, and no page scrolled horizontally.
- The labels were the 30-character cap rather than the committed pool's 28-character longest, so the
  worst case the cap permits is what passed — not merely the worst case that exists today. The
  committed F1 pool cannot compose a deck until #16, so the run used a synthetic 180-square pool
  carrying the real pool's labels plus three padded to the cap.
- At `ipad-11-landscape` the grid does not spread: `max-w-md` on the page holds it to a 400px square
  block, so the inverted risk above does not bite. What it leaves instead is a small card in a wide
  viewport with a lot of empty space — a layout question for #14's two-pane work, not a defect.
  **Answered by #14**: that space is the right pane. See #14's run block below.

**Settled by #10's gate run** (Playwright, `page.setViewportSize`, all four viewports, the sheet and
the card back-to-back, with a per-row `scrollHeight`/`scrollWidth` assertion):

- The deck sheet's 40 rows are unclipped at every viewport and no page scrolls horizontally. Rows are
  full-width and wrap, so the sheet's risk is the opposite of the card's — nothing is squeezed into a
  68px cell.
- The guest view at `phone-small` offers no sheet and no toggle, which is the visual half of the
  criterion the API enforces.
- Like the card, the sheet sits in the page's `max-w-md` column, so `ipad-11-landscape` leaves the
  same wide empty margin #8 noted. Same #14 question, same non-defect — and answered the same way,
  below.
- **A caution for any future card gate.** Padding a label to the 30-character cap with one long
  unbreakable run (`Hand-written moment 36 WWWWWWW`) clips the card grid at both iPad viewports,
  where the `clamp()` font has grown to its 0.8rem ceiling while `max-w-md` holds the cells at their
  phone size. The card's headroom at the cap depends on the label's word lengths, not only on its
  character count. **The rest of this bullet as originally written — "words that break do not clip",
  and the reading that this is latent rather than live — was measured wrong and is superseded by
  #11's block below, which puts a number on it.**

**Settled by #9's gate run** (same method, against the two screens D8's corrections added plus a
re-check of the marked card, driving a real API and a real Postgres so the marks were derived rather
than stubbed):

- **Game — undo toast** passes at all four viewports. The toast is one flex row — label, then the
  Undo button pinned right — 58px tall at every size, and at `phone-small` its top sits at 609 with
  the card ending at 395, so it covers nothing. The label was a square padded to the 30-character
  cap and still did not clip or push the button out.
- **Game — retract dialog** passes at all four viewports: the panel is `max-w-xs` centred in a
  dimmed full-screen layer, so it fits inside 375 CSS px with both buttons on screen and never
  scrolls. Its prose was measured for overflow, not eyeballed.
- **Game — marked card** re-checked because a mark this player may correct is now an *enabled*
  button rather than a disabled one. No visual change fell out of that — the classes are the same
  either way — and no cell clipped at any viewport.
- **Game — credit over undo** passes at all four viewports, added in review round 1 when the bottom
  slot stopped being winner-takes-all. Measured with a real remote call arriving over SSE while the
  local undo window was open, not simulated: two 52–58px rows, the credit above and the undo below,
  tops at 557/609 at `phone-small` against a card ending at 395. Both unclipped, neither wider than
  the viewport, and the Undo button still hit-testable under the credit.
- **Game — host deck sheet** re-checked after the rebase onto #10, because a host calling from the
  sheet now opens the undo window and lands D8's toast on a screen that never carried one. Passes at
  all four: the toast overlays the list (which is right — the sheet is a long scroller, not the card
  that must stay uncovered), no row clips, and the page can always scroll clear of the toast's 58px,
  so no deck row is permanently hidden underneath it.
- The run used the same synthetic 180-square pool as #8, with twelve labels padded to the cap so
  several of the capped worst case land on one card rather than at most one. The padding was an `X`
  run rather than #10's `W` run, so it does not contradict the caution above — `W` is the wider
  glyph, and that caution stands.

**Settled by #46's gate run** (the committed harness — `apps/web/gate/`, WebKit with touch, all four
viewports — against the correction that used to be the note here: *"not gated, because there is
nothing to gate"*, when the host could only retract from the card and the ~16 deck squares on no card
of theirs were uncorrectable through the UI):

- **Game — retract dialog from the deck sheet** passes at all four viewports, and it is the dialog's
  first *committed* measurement — #9's run measured it over the card, with a harness that is not in
  the repo. The panel is 320x194 at every size (`max-w-xs` centred in a `fixed inset-0` layer), so it
  is identical on a 375px phone and a 1194px iPad and whole on screen at both: top at 236 on
  `phone-small` against a 667px viewport, and at 500 on `ipad-11-portrait` against 1194.
- Measured with `expectWholeOnScreen`, a new instrument, rather than the bottom slot's
  `expectClearOfTheCard`. Two reasons, both structural: with the sheet up there is no card on screen
  to be clear of, and the sheet behind the dialog is a 2218px scroller in a 667px viewport — so
  `expectNoVerticalScroll` says nothing here, and a button below the fold on a `fixed` layer is
  unreachable rather than merely awkward.
- **A defect this found, and it was not #46's.** Both dialog buttons were 24px tall — browser
  defaults, no `min-h-11` — against the 44px minimum every other tappable thing in this app is held
  to. #9's run recorded *"both buttons on screen"* and that was true; a 24px button is on screen. They
  are 286x44 now, and `Take it back` / `Keep it` are asserted with `expectThumbSized` so the next
  round trip cannot lose it again.
- Driven to the end rather than to the dialog: the row is *called* from the sheet, tapped again to
  open the dialog, and **Take it back** returns it to `aria-pressed="false"`. This is the run's own
  answer to "reachable has to mean the square unmarks".
- **Seeded regression.** Putting the row back the way it was — `disabled={finished || mark !==
  undefined}` in `deck-sheet.tsx`, which is exactly the pre-#46 state — fails this test at all four
  viewports. The corresponding component test in `apps/web/test/game-screen.test.tsx` fails on the
  same one-token revert.
- The fixture gained a real fix on the way: `gameFor` invented a call's `seq` as `100 + index` while
  the `/call` route kept its own map, and a deck square called from the sheet would have rendered a
  row whose seq mapped to nothing — a 409 dressed as a working retraction, which is the third time
  this fixture has done that. There is now one call log and the seq is decided in one place.


**#11's gate run** (Playwright, `page.setViewportSize`, all four viewports; host and late-joiner
cards, prizes/standings/timeline populated, and the toast fired off a real SSE stream):

- No page scrolled horizontally at any viewport, and no row of the prizes, standings or timeline
  lists overflowed its own box — including a 24-character display name, which is the cap.
- The toast wrapped to two lines over a populated results panel and still covered no part of the
  card, at all four viewports, sharing the bottom slot with #9's undo row.
- Greyed inherited marks and earned marks resolved to two distinct computed background colours on a
  late joiner's card, at all four viewports.
- **Re-gated against #9's stacked bottom slot** after the rebase, because the results panel is the
  first thing to sit under it. Driven for real — this browser tapped its own square to open the undo
  window while a second player's call arrived over SSE — so two rows stacked at all four viewports.
  Neither covers the card, neither is wider than the viewport, neither clips, and the Timeline
  heading scrolls clear of both. The rows do overlay the *timeline* at `phone-small`; that is the
  same call #9 made for the deck sheet, and right for the same reason — the panel is a scroller, not
  the card that must stay uncovered.
- Measured with a `Range` rect against each cell's content box rather than `scrollWidth` (see the
  reconciliation below), against a pool of 30-character labels whose longest word is 10 — the
  committed F1 pool's own boundary — so the run measures this change rather than re-finding #47 in
  every cell. Zero cells overflowed.

**The card-cell clip, reconciled — this supersedes #10's caution above and #11's own first reading.**

Both earlier accounts were measured with the per-cell `scrollHeight`/`scrollWidth` assertion this
file prescribes, and **that method under-reports horizontal overflow on these cells**: the cell is a
`justify-center` flex container, and content overflowing a centred flex line is not counted in
`scrollWidth`. Re-measured with a `Range` over the cell's text, compared against the cell's content
box, at 30-character labels whose *longest single word* was swept from 4 to 22 characters:

| Viewport | Cell | Font | Longest word that fits | First length that overflows |
| --- | --- | --- | --- | --- |
| `phone-small` / `phone` | 62–65px | 8px | 13 characters | 14 (+9.3px) |
| `ipad-11-portrait` / `ipad-11-landscape` | 77px | 12.8px | **10 characters** | **11 (+7.1px)** |

The mechanism is the one #10 identified: `max-w-md` in `app/r/[code]/page.tsx` holds the page to
448px, so a cell stays ~77px at every viewport at or above that, while the
`clamp(0.5rem, 1.7vw, 0.8rem)` in `card-grid.tsx` reaches its 0.8rem ceiling from ~753px up. The
cell stops growing and the text does not, so an iPad cell fits *fewer* characters per line than a
phone cell does — about 10 against about 13.

What both earlier readings got wrong:

- **#10's "words that break do not clip" is false.** Ordinary breakable words overflow, at 11
  characters and up on an iPad. The variable is word length, not whether a token is nonsense.
- **#11's first reading — "a live defect at 12 of 24 cells" — overstated it.** That run padded
  labels with `.ljust(30, 'X')`, which manufactured 11-character unbreakable runs; the 2px readings
  it reported were vertical and spurious. Nothing overflows *vertically* at any viewport or word
  length measured.
- **Neither "latent" nor "12 of 24" is right.** The committed F1 pool's longest single word is
  **exactly 10 characters**, and no label exceeds it — which is why #8's and #10's runs passed on
  real labels, and why nothing is broken on screen today. The v2 rewrite (#57–#60) did not move it:
  at 300 squares nothing runs over 10, and 27 squares sit exactly on the ceiling. (One label carries
  a 12-character *hyphenated* word, `Re-Explained`, which breaks at the hyphen — a gate that splits
  on whitespace alone will read it as an overflow it is not.) But ten is zero headroom, not safety:
  *investigation* (13), *championship* (12), *disqualified* (12) and *reprimanded* (11) are ordinary
  motorsport vocabulary, and the next pool pass or the next theme can reach for any of them.

Tracked as **#47** rather than left as prose here. Two things belong in it: the iPad font ceiling,
and the gate method, since the `scrollWidth` assertion this file used to recommend is what hid the
problem three times.

**Both halves were addressed by #13** and #47 is the issue to close them against, not this file.
The font ceiling is gone — cell text is `3cqw` of the card, and the ratio is asserted across two
viewport widths, which is the only shape of assertion the defect cannot satisfy. The method is gone
too: this file no longer prescribes `scrollWidth` anywhere, and `overflow()` in
`apps/web/gate/measure.ts` is the `Range` measurement instead. The `scrollWidth` mentions that remain
below are **historical** — descriptions of how #8's, #10's and #11's runs were taken, which is why
those runs under-reported. Do not read them as method.

### Known-unverified claims inherited from #4

These are the criteria that were signed off by eye. Any gate run should confirm them explicitly
before treating them as settled:

- The room code **and share link** at phone width — the link is a full `https://host/r/CODE` and is
  rendered as body text, so long deploy hostnames are the wrapping risk.
- The roster's `(host)` and `— you` suffixes — currently bare string concatenation inside the `<li>`,
  with no styling to keep them distinct from the player's name.
- The home screen's two stacked forms at `phone-small`, inside a `min-h-dvh` centred column.

**Settled by #13's gate run**, except for Home — closed separately by #68's run below.
`gate/lobby.gate.ts` covers the join form, the
roster with both suffixes, the share link, the host lobby and the two ways a room fails to resolve, at
all four viewports — they were gated because #13 changed them: the game screen went full-bleed, so the
page's centred column moved off `page.tsx` and into each pre-game state.

- The share link wraps rather than overflowing, and the roster's `(host)` and `— you` survive.
- "No room has the code ABCD." and "Could not reach the room." are asserted to be *different* screens,
  which is the criterion #4 could only eyeball.
- **A defect, found by that gate and fixed in #13**: `Join` and `Start game` were bare `<button>`
  elements and therefore **24px tall** at every viewport — the two taps between six friends and a
  game, on a target no thumb reliably hits. The same class of failure #12 found in its own switcher,
  and again invisible to review. Both are 44px now.

**Settled by #68's gate run** (`gate/home.gate.ts`, all four viewports), closing the last row in the
table and the last of #4's criteria above:

- Both forms and the API health line are on screen at `phone-small` without scrolling: the two
  headings and the first submit button by `toBeInViewport()`, and the `Join` button and the `API:`
  line — the two bottom-most, and the two actually at risk of falling off the bottom — whole on
  screen by `expectWholeOnScreen`, which a single intersecting pixel cannot satisfy.
- No page scrolls horizontally at any of the four viewports.
- The health line's own box does not move between its `checking…` state and either of the two ways
  it can settle: a 200 (`all clear`) and a transport failure (`unreachable`) both leave the box where
  it was.
- **A defect this found, the same class #13 fixed next door.** `Create a room` and `Join` were bare
  `<button>` elements and therefore 24px tall at every viewport — never measured, because Home was
  the one screen with no gate to measure it. The room screen's `min-h-11` class string moved out of
  `room-screen.tsx` into `app/action-button.ts` so both screens style a submit button one way; both
  home-screen buttons are 44px now and pass `expectThumbSized`.

## Status of the toolchain

**The gate is in the repo and runs, as of #13.** `pnpm --filter @twinion-bingo/web run gate`, in
`apps/web/gate/`, and in CI as the `gate` job. 36 tests at each of the four matrix viewports, 144 in
all — `room.gate.ts` for the game screen, `lobby.gate.ts` for everything before the deal, and
`install.gate.ts` (#15) for the manifest, the icons and the absent service worker. Since #14 a test
may belong to one layout rather than to a viewport, so **24 of those are skipped by layout rather than
run** and 120 execute: see #14's run block. These are the figures of one run of the suite with both
#14 and #15 in it — they are **not** #14's and #15's own totals added up, which would double-count
everything inherited from #13. Failures keep a trace and a screenshot, which the CI job uploads.

It was assigned to #12 and then to #13. **#12 settled without it, deliberately** — it prototyped the
room screen on a throwaway route and verified from a scratch directory outside the repo, because a
route with a deletion date is the wrong thing to hang the repo's permanent gate off. That cost the
numbers: **#12's measurements cannot be reproduced**, because the scripts went with the directory. The
conclusions were confirmed on real hardware; the figures behind them are not repeatable. Preventing
exactly that is what this file is for, which is why the gate is now a devDependency and a CI job
rather than a script somebody ran once.

Three things it carries forward from #12, each of which cost a wrong result to learn:

- **Drive it, do not read it.** Three defects were invisible to code review and immediate under a
  browser: 22x24px tap targets, a `fixed inset-x-0` wrapper swallowing taps across its full width,
  and `cqw` silently falling back to viewport units. So the gate uses `.tap()` under `hasTouch`, and
  `expectThumbSized` exists because 44px is a thing to assert rather than to hope for.
- **Measure the rendered text, not `scrollWidth`.** `overflow()` in `gate/measure.ts` is a `Range`
  over the painted line boxes. See #47 for the full account.
- **WebKit, and exact viewports.** The targets are iPhone and iPad Safari; #12 graded a font decision
  in Chromium and had to caveat it. And #12 published a set of `phone-small` numbers measured at
  320x568 against a registry that says 375x667, so the config takes its sizes from the matrix above
  rather than from a device profile.

**What the gate does not cover, said plainly.** It intercepts the API rather than running one, so it
proves nothing about the API's contract — a field renamed server-side keeps the gate green. That is
covered by `apps/web/test/` on this side and `apps/api/`'s tests on the other. And it cannot answer
whether 11px type in a 73px cell *reads* at arm's length with a car moving, which is a question about
eyes. That stays a hardware pass.

**#13's gate run** (WebKit with `hasTouch`, all four matrix viewports, 96 tests green, the card measured with a `Range` against each cell's content box):

| Viewport | Cell | Font |
| --- | --- | --- |
| `phone-small` | 70px | 11.0px |
| `phone` | 73px | 11.5px |
| `ipad-11-portrait` | 162px | 24.8px |
| `ipad-11-landscape` | 138px | 21.2px |

- **Zero cells clipped at any viewport**, at 30-character labels whose longest word is 13
  (`investigation`) — not the committed pool's 10, which is zero headroom. Unmarked, earned-marked and
  inherited-marked all three.
- The iPad cell is now *larger* than the phone cell rather than the same size, which is #47 fixed:
  cell text is `3cqw` of the card, so characters-per-line holds constant and the type stops outrunning
  the cell. Cell text is about 40% larger on a phone and 94% larger on a portrait iPad than the card
  rendered before.
- **The bottom slot covers no part of the card at any viewport**, asserted as box intersection rather
  than by eye — and it is now docked in flow rather than pinned, so that is a property of the layout.
  Driven with a real credit arriving over the stream while a local undo window was open.
- The card's box is **identical to the pixel** across a round trip through the `Race` tab, and does
  not move when a call lands.
- 24 rows of the open-squares list at lights out, descriptions to 127 characters, none overflowing.

**A cell is fitted for the weight a *mark* renders it in**, not for the weight it currently has. A
marked label is `font-semibold` and therefore wider, and the fit is recomputed only when the label
*text* changes — so a cell fitted at the regular weight clipped the moment somebody called it, and
nothing re-fitted it. Fitting for the bolder face up front costs the few shrunk cells a fraction of a
size while unmarked, and buys a card whose cells never resize mid-race and no forced reflow per call.

**Five seeded regressions, because a gate that has only ever passed is not evidence.** Each was
reintroduced deliberately and the gate re-run:

| Seeded | Caught |
| --- | --- |
| #47 exactly — `clamp(0.5rem,1.7vw,0.8rem)` behind a `max-w-md` page | Yes, at all four — but **only** by `sizes its type against the card`, and only once that test compared two viewport widths (see below) |
| Shrink-to-fit removed, `cqw` sizing kept | Yes, at `phone-small` and `phone`: `championship` clips by 1.6–2.5px |
| The bottom slot pinned (`fixed inset-x-0 bottom-0`) again | Yes, at `ipad-11-landscape` — the only viewport where the card is tall enough to reach a pinned row |
| Cells fitted at the regular weight instead of the marked one | Yes, at `phone`: four `Championship …` cells clip by 0.7–0.8px **only after being tapped** |
| The long-press flag shared across cells instead of per square | Yes, at all four: a second pointer turns a hold into a `/call` post |

Two findings from that exercise that matter more than the passes:

1. **A clipping check cannot see #47.** With the defect reintroduced, every cell still fitted, because
   shrink-to-fit repairs the symptom after the fact. The mechanism needs its own assertion.
2. **A ratio checked at one viewport cannot express "the same ratio everywhere".** The first version of
   that assertion passed on both iPad projects with the bug in place: behind `max-w-md` the card is
   448px and the clamp ceiling is 12.8px, which is 2.9% of it — indistinguishable from a correct
   `3cqw`. The test now resizes within itself and compares, which is the only shape the bug cannot
   satisfy. Worth remembering for any future per-viewport assertion in this file.

**Two blind spots this file should name, because both hid a real defect in tests written for it.**

1. **Serving a state is not the same as reaching it.** `carries it marked too` opens a card whose marks
   are already in the first render, so the fit is computed with the bold applied and the clip cannot
   appear. Only the live unmarked-to-marked transition was broken — the only transition a race performs.
   A gate test that arrives at a state must also **drive** its way there.
2. **A gesture needs more than one pointer.** The long-press was gated by holding one cell, which
   passed while a second pointer anywhere on the card turned that hold into a call for the whole room.
   A full-bleed card is held in a hand; a resting thumb is an input.

Also worth knowing: the pinned-slot seed is caught at one viewport out of four. That is not a weakness in the
assertion, it is the geometry — and it is the argument for gating all four rather than only the two
a phone-layout issue is about.

The two blocks below are records of **two separate runs**, #14's and #15's, each as the suite stood
when that issue landed. The merged suite's own figures are in *Status of the toolchain* above; they
were re-measured rather than summed.

**#14's gate run** (WebKit with `hasTouch`, all four matrix viewports, 124 tests as the suite stood
then: 100 green and 24 skipped by layout — see below. Re-run after the merge with #15 the totals are
144/120/24: the 24 layout skips are unchanged, which is the part of this run that #15 could have
disturbed and did not):

The 11" iPad is a first-class target from here, and it is **two layouts, switched in pure CSS at
Tailwind's stock `lg` (1024px)**. `ipad-11-portrait` (834) is deliberately on the *phone* layout —
a comfortable single column with the larger cells, which is what #14 asks for there — and
`ipad-11-landscape` (1194) is the only matrix viewport that gets two panes.

| Viewport | Cell | Font |
| --- | --- | --- |
| `phone-small` | 70px | 11.0px |
| `phone` | 73px | 11.5px |
| `ipad-11-portrait` | 162px | 24.8px |
| `ipad-11-landscape` | **108px** | **16.7px** |

- Only the landscape row moved, and it moved *down*: the card no longer has the whole viewport, so
  138px/21.2px became 108px/16.7px. It is still half again the phone cell, and the type is still
  `3cqw` of the card, so characters-per-line is unchanged — which is the property #47 is about.
- **A width-dependent constant in a test that resizes is the wrong shape of assertion.** `sizes its
  type against the card` asserted `wide.cell > narrow.cell * 1.5` at 1194x834; two panes make that
  1.48 and it failed on geometry rather than on a defect. What it was replaced with — and what was
  wrong with the first replacement — is below, under the tautology.
- **24 tests are skipped rather than weakened.** Seven two-pane tests do not apply below `lg`, and
  three phone-layout tests (the `Card`/`Race` control, and both accordion tests) do not apply above
  it. Each skip names the layout it belongs to; nothing was loosened to pass in both.

- **The gate was green and the layout was broken, and that is the most useful thing in this run.**
  Two defects survived a full green pass and were found in review afterwards. Both are fixed and both
  now have assertions; the reason they got through is worth more than either fix:

  1. **The page scrolled instead of the pane.** The screen was `min-h-dvh` — a *minimum* — so the row
     holding the two columns had no definite height, its `flex-1` panes grew to their content, and
     `overflow-y-auto` never engaged. At lights out the right pane stood **1427px** tall and the
     document scrolled **742px**: reading the list drags the card off screen, which is the one thing
     two columns exist to prevent. The gate could not see it because **it had an instrument for
     horizontal scroll and none for vertical** — `expectNoVerticalScroll` now exists, and the fix is
     `lg:h-dvh` on the screen plus keeping the card column's own scroller (the host's 40-row deck
     sheet lives in that column, so it needs one; the prototype could drop it because the card was all
     that column ever held). The new tests also *drive* the scroll and re-assert the card's box, and
     check the pane actually moved — otherwise "the card did not move" passes for the wrong reason.
  2. **A finished game opened on a blank pane.** `LookingForPanel` had no empty state, so at a full
     house the right half of the screen was empty with **Final standings** behind an unhinted tab. The
     test asserted the tab caption read `Looking for 0`, which is true of a blank pane. It now asserts
     the words.

  The pattern in both: **an assertion about a caption or an intersection is not an assertion about the
  layout.** Same lesson as the stacked-columns seed below, arrived at three separate ways in one run.

- **A tautology was written into this gate and then taken out, which is worth recording.** The old
  `expect(wide.cell).toBeGreaterThan(narrow.cell * 1.5)` had to go — two panes make the landscape card
  557px against a narrow 382px, so the cell goes 73px to 108px, which is 1.48 and fails on geometry
  rather than on a defect. What first replaced it — "the cell is the same *fraction* of the card at
  both widths" — is **true by construction** for a `grid-cols-5 gap-1` grid and discriminates nothing.
  What actually defends #47 is the `font / card` band asserted at **two** widths, and that was
  re-seeded to prove it: with the defect back (`clamp(0.5rem,1.7vw,0.8rem)` behind a `max-w-md` page)
  the narrow reading is 8px in a 382px card — **0.021**, outside the band — and the test fails at all
  four viewports. A clipping check still passes, which is #13's finding standing.

- **A loose locator, found the same way.** `racePanel()` resolved to the whole `Race` *surface* at
  phone widths, which since #14 also contains the right pane's hidden list — so `reads the race out`
  measured 24 hidden rows alongside the standings. Hidden rows return empty `getClientRects()`, so
  they measure clean *and* satisfy "has rows": the test would have passed with the standings rendering
  nothing at all. It now names the results panel (`Race pane`) in both layouts.
- **Both layouts' markup is in the document at every width** — the price of a CSS-only switch, and
  paid deliberately: a `matchMedia` hook costs a flash of the phone layout on the device being judged
  (#12 rejected it for that), and "rotating mid-game preserves state and does not drop the SSE
  connection" is true *by construction* only while `RoomScreen` stays one mounted element. Worth
  knowing if you count rows in a future gate: **the open squares appear twice in the document and
  once on the screen**. Two consequences already paid for:
  - The right pane's list is *not* `aria-label="Squares still open"` and its Race tab is named
    `Race pane` — a duplicated accessible name would be ambiguous everywhere, and in jsdom (no
    Tailwind, so both copies read as visible) it breaks the query outright.
  - `inert` and `aria-hidden` came off the two surfaces. Neither can be media-queried, and left on
    the phone's tab they would have made the right pane permanently un-hittable at `lg` — #12's
    "invisible band that swallows taps", inverted. `hidden` is `display: none`, which is already both
    non-hit-testable and out of the accessibility tree; #12's case was an *off-screen* panel that was
    still being painted. The jsdom suite therefore reads the class, because it is the only signal on
    that side, and this gate is what asserts the real thing per viewport.
- **Rotation is driven, not reasoned about.** A call is made at landscape, the viewport is set to
  portrait and back, and the mark, the open undo row and the selected right-pane tab are all still
  there. The stream is counted rather than looked at: `openRoom` hands back `streams()`, the number of
  `EventSource`s the page has *ever* opened, and it is 1 across the rotation. It has to be counted in
  the stub rather than off `page.on('request')` — the fixture replaces `EventSource` itself, so the
  stream never reaches the network.
- **Two seeded regressions, and the first one found a hole in this run's own assertion.**

| Seeded | Caught |
| --- | --- |
| The two columns stacked (`lg:flex-col` on the row) — the phone layout with extra steps | **Not at first.** `expectClearOfTheCard` passes a pane *below* the card, because a pane below the card covers nothing. "Both columns up at once" was being asserted as non-intersection, which stacking satisfies. `expectBesideTheCard` in `gate/measure.ts` is the fix: the pane starts at or after the card's right edge, and the two share vertical space |
| The columns in the wrong order (`lg:flex-row-reverse`) — beside, but on the wrong side | Yes, by the new instrument, naming the geometry: *the right pane starts at x=29 against a card ending at x=1174* |

  The lesson is the one this file keeps re-learning: **an assertion that a thing covers nothing is not
  an assertion about where it is.** Two panes are a claim about position, so position is what has to
  be measured.

- **Two of #14's own acceptance criteria are answered differently, on the record.** The right pane is
  tabbed rather than permanently split (#12's C1 traded that and named the cost; #14's body says to
  follow the prototype), and `description` does not render inline in the cell (the pool licences prose
  to ~130 characters against a ~162px portrait cell — the open-squares list is the answer to the same
  need). Both are commented on the issue rather than left in a diff.
- **The prototype route is gone**, per its own NOTES.md: `apps/web/app/prototype/` is deleted in the
  same PR. Its numbers were superseded by #13's table above; the file itself is in git history.
- **Still a hardware pass, and not gateable:** whether 16.7px type in a 108px cell reads at arm's
  length on a real 11" iPad, in both orientations, with a car moving — and whether calls keep arriving
  through a real rotation on real hardware. Same class of question as #13's, for the same reason.

**#15's gate run** (WebKit with `hasTouch`, all four matrix viewports, 116 tests green as the suite
stood then — before #14's layout skips were in it):

- **The burst covers nothing and catches nothing.** `canvas-confetti` appends one canvas to `body`,
  computed `position: fixed` and `pointer-events: none`; the card's box is identical to the pixel
  across a real PRIZE frame arriving on the stream, and a cell tapped mid-burst posts its `/call`
  and comes back marked. Both properties are read off the element rather than assumed from the
  library's README — they are the whole reason the global `confetti()` is used rather than a canvas
  of ours, so they are the thing to notice if a future version stops holding them.
- **The unfurl is gated as far as it can be**: `og:title` carries the room code, `og:image` is
  *absolute* (a relative one unfurls as a bare link on every machine but the one that rendered it),
  and the image route answers 200 `image/png` **with no API to ask** — the gate builds and serves
  against `http://api.gate.invalid`, so what passes there is specifically the code-only fallback
  card. The theme half of the criterion needs a real API and is a hardware/by-hand check.
- **The install head is gated at `/`**, including the negative claim. Seeded regression: registering
  a service worker in `layout.tsx` fails `registers no service worker` immediately, which is what
  makes that criterion evidence rather than prose.

**What still needs hardware, said plainly.** The gate can prove a manifest links, parses and points
at icons that exist; it cannot prove a phone offers Add to Home Screen, that the installed launch
has no browser chrome, or that the icon looks like anything on a home screen. iOS ignores the
manifest entirely and reads `apple-icon.png` and `appleWebApp` instead, so **the install criterion
is a two-device hardware pass** (one iPhone, one Android) and the gate is the part of it that can be
re-run. The icon art is a deliberate placeholder — a monogram on `neutral-950` — and is a design
question, not a gate one.

## Adding a surface or a screen

Add the row when the screen lands, in the same PR. A screen that exists and is not in this table is
a screen nobody will check, which is the situation this file was written to end.
