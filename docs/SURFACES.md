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
| Game — retract dialog | `/r/:code`, tapping a marked square you may correct | The confirmation centred over the dimmed card: the prose naming the square and saying it unmarks for everyone, with **Take it back** and **Keep it** both on screen without scrolling |
| Game — slim bar       | `/r/:code`, a live game                          | One line carrying **your mark count, the rung being played for, and the roster size** (not presence — see #67) — all three fitting at 375 CSS px beside the room code, and the rung dropping out rather than reading "full house next" once the ladder is spent |
| Game — the two surfaces | `/r/:code`, tapping `Card` and `Race`          | The segmented control **thumb-sized (44px)**, each surface whole and neither covering the other, and the card's box **identical to the pixel** after a round trip through the Race tab — both panels stay mounted, so a lost scroll position or a re-measured grid is a defect |
| Game — race surface   | `/r/:code`, `Race` up on a game with calls in it | Prizes, standings and timeline at full column width, no row overflowing its own box on a 24-character display name |
| Game — a square's prose | `/r/:code`, a card cell held down for 400ms    | D4's `description` in the docked slot, **covering no part of the card**, gone on release — and the release **not** also calling the square, which is the way this can go wrong that no screenshot shows. Drive it with a **second pointer on another cell** too: a resting thumb on a one-handed card once turned the hold into a call for the whole room |
| Game — what am I looking for | `/r/:code`, the block under the card, open at lights out | All **24** rows and their prose (to ~130 characters, #12's licence) with none overflowing, the toggle thumb-sized and its count reading while the block is shut, and the count falling to `(0)` at a full house |
| Game — a prize landing | `/r/:code`, a PRIZE frame arriving on a live game | The burst playing while **the card's box is identical to the pixel**, and a cell tapped mid-burst still calling for the room. The only surface here that is not docked in flow: `canvas-confetti` owns the canvas and gives it `position: fixed; pointer-events: none`, so both halves are a library's property and are asserted rather than trusted |
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

**Settled by #10's gate run** (Playwright, `page.setViewportSize`, all four viewports, the sheet and
the card back-to-back, with a per-row `scrollHeight`/`scrollWidth` assertion):

- The deck sheet's 40 rows are unclipped at every viewport and no page scrolls horizontally. Rows are
  full-width and wrap, so the sheet's risk is the opposite of the card's — nothing is squeezed into a
  68px cell.
- The guest view at `phone-small` offers no sheet and no toggle, which is the visual half of the
  criterion the API enforces.
- Like the card, the sheet sits in the page's `max-w-md` column, so `ipad-11-landscape` leaves the
  same wide empty margin #8 noted. Same #14 question, same non-defect.
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

**Not gated, because there is nothing to gate.** The host can only *retract* from the card, never
from the sheet: a retraction names a CALL by `seq` and `deck.called` carries square ids alone. So a
call for one of the ~16 deck squares that are on no card of the host's is uncorrectable through the
UI. See the note on #9.


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

**Settled by #13's gate run**, except for Home. `gate/lobby.gate.ts` covers the join form, the
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

**Home (`/`) is still ungated** — the one screen in the table with no test, and its #4 criterion above
still unverified. Tracked as #68, with the note that its buttons have never been measured for tap size
either, which is the defect #13 found next door.

## Status of the toolchain

**The gate is in the repo and runs, as of #13.** `pnpm --filter @twinion-bingo/web run gate`, in
`apps/web/gate/`, and in CI as the `gate` job. 29 tests at each of the four matrix viewports, 116 in
all — `room.gate.ts` for the game screen, `lobby.gate.ts` for everything before the deal, and
`install.gate.ts` (#15) for the manifest, the icons and the absent service worker. Failures keep
a trace and a screenshot, which the CI job uploads.

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

**#15's gate run** (WebKit with `hasTouch`, all four matrix viewports, 116 tests green):

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
