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

There are four skins, two of them light (#102, #103) — the Theme button in every screen's top bar
reaches Confetti and Scorecard from any surface, so "dark is the only theme" stopped being true once
that control existed.

**A per-skin gate exists as of #109, and it is narrower than the viewport matrix on purpose.** Most
of this file's gate still exercises whichever skin the browser opens on (`pitwall`, the cookie's
default) — tabs, dialogs, state, the stream, a call landing, are not skin-dependent, and asserting
them four times buys nothing. `apps/web/gate/skin-matrix.gate.ts` is the exception: a **skin matrix**
that runs only the assertions a skin's own CSS *can* break — cell clipping (marked and unmarked),
horizontal scroll, vertical scroll at `ipad-11-landscape`, thumb-sized header controls, the header's
line count, the right pane beside the card at `ipad-11-landscape`, and `/legibility`'s worst 24 — at
all four skins (`apps/web/gate/room-fixture.ts`'s `forEachSkin`, which seeds the skin cookie rather
than pressing the Theme button, so it exercises the server-rendered `data-skin` path) and all four
viewports above. Running the *whole* suite at four skins was estimated at ~576 WebKit tests; the
matrix is 16 tests instead — see #109's own gate run, below, for the full account of what that
excludes and why. `docs/adr/0009-skin-css-variable-layer.md` records the decision this gate's shape
follows from: one React tree across skins is what makes a shared test body reusable at all four in
the first place.

**Cell and font by skin**, at every viewport, each row sourced from that skin's own gate run
(#104/#105/#106/#107, cited fully in their own entries below) and re-confirmed rather than assumed by
#109's own run over the current head:

| Skin | `phone-small` | `phone` | `ipad-11-portrait` | `ipad-11-landscape` |
| --- | --- | --- | --- | --- |
| Pit Wall | 70px / 11.0px | 73px / 11.5px | 162px / 24.8px | 108px / 16.7px |
| Slipstream | 70px / 7.0px | 73px / 7.3px | 162px / 15.7px | 108px / 10.6px |
| Confetti | 69px / 9.5px | 72px / 9.9px | 160px / 21.5px | 106px / 14.5px |
| Scorecard | 70px / 6.2px | 73px / 6.5px | 161px / 14.0px | 107px / 9.5px |

Cell width is skin-agnostic geometry (the shared `grid-cols-5` grid, Confetti's own 5px/7px gap
aside) and varies by a pixel or two only where a skin's own gap or border width moves it; font size
is each skin's own per-skin label-size token, set against how wide its label face renders — Baloo 2
(Scorecard) is the widest of the four faces, so its token is the smallest.

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
| Header — skin controls | `/`, `/r/:code` needing a name, `/r/:code` in the lobby, and the game header | The **Theme button**, present and tappable in the top bar of all four surfaces: pressing it advances the fixed skin cycle without a remount — a live game's SSE stream survives four consecutive presses at `phone`. Its *hit* element (not its visible box) is ≥44×44 at `phone-small`/`phone`. On the three `/r/:code` surfaces it sits beside the **die** (#108, which replaced #103's disabled placeholder) without the two 44×44 hit targets overlapping — both expanders are compared, now that the die has one — and the die's own visible box is square and equal to this button's rendered height, measured on first render and again after each press of a full turn of the skin cycle, since a skin's type scale is what moves that height. On `/` there is **no die**: it has no card, no game and no room, so the Theme button stands alone there and `home.gate.ts` asserts that (#108 names "the join and lobby headers", and the handoff's "join screen" is `/r/:code` needing a name). On the game header the die is enabled and tappable while the card is clean and the game is live, gone once the card has a mark or the game is done, and gone while the host deck sheet is up (#112's rule, unchanged: no card on screen, nothing to re-roll); on the join and lobby headers it is always present but disabled, since there is no card yet to re-roll. On the game header specifically, the slim bar's stats line shortens to `n/24 · m here` to buy back the width both controls cost, with `· <rung> next` dropping to a `hidden lg:inline` span — absent at `phone-small`/`phone`, present at `ipad-11-landscape` |
| Home                  | `/`                                              | The two stacked forms ("Start a room", "Join with a code") both reachable without scrolling past one; the API health line. **#104 changes its appearance twice, both token-driven and neither structural**: every corner on this screen is now `rounded-skin` rather than a literal `rounded`, so it is square under Pit Wall (`--skin-radius: 0`, the handoff's "Radius 0 everywhere") and takes each later skin's own radius; and the whole screen inherits Pit Wall's monospace UI face. Its two submit buttons are deliberately **not** accent-filled — see the note under #104's gate run |
| Room — needs a name   | `/r/:code`, roster `you === null`                | The name form and heading fit; the disabled/enabled button state is legible. **#104**: the four-character **room code**, the ruled name field and the **indexed roster** (with a `Host` tag) are structural pieces this state did not have before — present and unclipped at `phone-small`/`phone`, reachable without scrolling past the primary action; at `ipad-11-landscape` the roster sits beside the code column, not under it. The code's type is the handoff's own **38px/700 at `phone-small`/`phone`, 52px from 834px up** |
| Game — progress readout | `/r/:code`, a live game                          | **#104**: a second progress readout above the grid, distinct from the slim bar's own `n/24` line — a pure function of `game.marks.length` against 24, so it carries no state of its own and cannot disagree with the header. **The 12-segment bar shows at every viewport; its large numeral is `ipad-11-portrait`/`ipad-11-landscape` only** — `Bingo Screens.dc.html` draws the phone card screen as the bar alone, with the count carried by the slim bar, and putting a second copy of the header's number on a phone cost 40px of a 667px viewport |
| Room — roster         | `/r/:code`, joined                               | The room code heading, **Share room** where the share link used to be printed (#88 — the link itself is in the dialog now), and the roster with `(host)` and `— you` |
| Room — loading        | `/r/:code` before the roster resolves            | The single-line state does not shift the layout when it resolves                                                          |
| Room — missing        | `/r/:code` with an unknown code                  | "No room has the code XXXX." reads as an answer, not an error page                                                        |
| Room — unreachable    | `/r/:code` with the API down                     | Distinguishable from "missing" at a glance                                                                                |
| Room — host lobby     | `/r/:code`, joined as the host, no game yet      | The **Start game** button below the roster, reachable without scrolling past the **Share room** control that replaced the share link |
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
| Game — card re-roll   | `/r/:code`, a live game whose card has no mark of either kind | The **die**, in the game header beside the Theme button (#108 — moved from beneath the grid, where #87/#112 first shipped it), icon-only with an accessible name of **Re-roll card**; its *hit* element is thumb-sized (44px) at `phone-small`/`phone`, and its visible box is square at the Theme button's own rendered height rather than a constant — asserted as that relationship, on both axes, at first render and after each press of a full turn of the skin cycle. Present only while the card is **clean and the game is live**, gone (unmounted, not disabled) for an **inherited** mark exactly as for an earned one, and **absent while the host deck sheet is up** (#112's rule, kept: no card on screen behind the sheet, nothing to re-roll — and it is also what keeps the `aria-describedby` target in the document whenever the die is offered). The tap is **immediate** — no confirmation between it and the deal (#87) — with its accessible name changing to **Re-rolling…** while the request is out (there is no visible label left to update) and a visually-hidden `role="status"` announcing **New card dealt.** when it lands. The grid never moves at all — "does not shift the grid when a call lands" stays green untouched. What sits **below** the grid does move when the first call withdraws the offer, and by the same amount as before #108: measured at `phone-small`, the accordion and the host deck-sheet button rise **72px** (the consequence prose's 60px plus the column's 12px `gap-3`) when the consequence paragraph unmounts with the offer. #87's slot beneath the grid was reserved whether or not the offer stood, so it contributed nothing to that movement and its removal costs nothing here — see the note in the #108 run below |
| Game — re-roll consequence | `/r/:code`, the same clean live card | ADR-0006's one-way door, still stated in the card column rather than the header — there is no room for a sentence up there — and still wired to the die by `aria-describedby` even though the two are no longer adjacent in the DOM (an id reference, not a proximity one): an already-called square landing on the new card arrives **grey**, counting in the **standings** and never winning a prize. Prose in flow, so the claim is that **no line of it is clipped** and it is whole on screen at every viewport. **No cell clipped on the replacement card** once it is dealt |
| Game — slim bar       | `/r/:code`, a live game                          | One line carrying **your mark count, the rung being played for, and the roster size** (not presence — see #67) — all three fitting at 375 CSS px beside the room code **and beside the Share room control (#88, whose trigger reads "Share" for exactly this reason)**, and the rung dropping out rather than reading "full house next" once the ladder is spent |
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
| Share — room unfurl | `/r/:code`, as a group-chat crawler reads it | The room code in `og:title`, an **absolute** `og:image` URL, and a 1200×630 image naming both the room code and its theme when the API is reachable; with the API unavailable, a code-only fallback still answering 200 `image/png` rather than collapsing to a bare link. A `link[rel=canonical]` and an `og:url` naming the **same origin** as `og:image` — one resolved origin per request (`app/site-origin.ts`), or a room has three names and a crawler picks one |
| Share — room dialog | `/r/:code`, tapping **Share room** in any resolved state | The native `<dialog>` **whole inside the viewport** at `phone-small` and **centred** rather than cornered; a high-contrast **black-on-white SVG QR with its white quiet zone**, encoding the canonical room URL; the room code; the full link **wrapping rather than overflowing**; **Copy link, Close and the link all thumb-sized (44px)**; a Copy tap **always answering** — either "Link copied" or the fallback naming the link to press and hold; **Escape and Close both closing with focus back on the trigger**; the card's box **identical to the pixel** while the dialog is open and the stream **not dropped**; and **loading, missing and unreachable offering nothing at all** |

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
  card. The theme half of the criterion needs a real API and is a hardware/by-hand check. The
  canonical tag and `og:url` are gated against the same origin, and that run sets no `SITE_URL` —
  so what it proves is the request-origin branch, the one every preview and every laptop takes.
  The production override is unit-covered in `test/site-origin.test.ts`, which needs no build.
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

**#88's gate run** (WebKit with `hasTouch`, all four matrix viewports, 192 tests green and 24
skipped — the layout-specific skips — with `gate/share.gate.ts` contributing 17 tests per viewport):

- **The dialog is one box at every size.** 320x544, with a 270x270 QR and 286x44 for each of the
  link, **Copy link** and **Close**; the **Share** trigger is 55x44 — see the slim-bar note below
  for why it is not 104x44. Its width is
  `min(20rem, 100vw - 2rem)`, so 320 is the answer at 375 CSS px and at 1194 alike — it is centred
  at every viewport rather than growing: (28,62) in 375x667, (35,150) in 390x844, (257,325) in
  834x1194, (437,145) in 1194x834.
- **A defect this found, and it is the reason the run exists.** Without `m-auto` the dialog measured
  320x544 at **x=0, y=0 on all four viewports** — a panel jammed into the corner of an 834x1194
  iPad, and `expectWholeOnScreen` passed it happily, because a cornered dialog *is* whole on screen.
  Centring a modal `<dialog>` is the UA sheet's `margin: auto`, and Tailwind's preflight zeroes every
  margin, so this is the app's claim and not the platform's. It is asserted as geometry now, in the
  same test as "whole on screen".
- **Escape and focus restore are gated here because jsdom cannot hold them.** jsdom 30's
  `HTMLDialogElement` has no `showModal`, no `show` and no `close` at all; `apps/web/test/setup.ts`
  polyfills the open/closed state and records, in the comment, that it models neither the top layer,
  the focus move in, the focus trap, Escape, nor focus restore. Asserting any of those there would
  be asserting the polyfill.
- **Focus restore is the platform's on the keyboard path and the app's on the touch path.** WebKit
  does not focus a `<button>` on tap, so a dialog opened by tap has an invoker that was never focused
  and nothing for `close()` to restore to — measured at `phone-small`: after a tapped open and a
  tapped **Close**, `document.activeElement` was the closed `<dialog>` itself, which is
  `display: none`, so the next Tab or VoiceOver step restarts at the top of the document rather than
  beside the trigger. `onClose` now focuses the trigger, which makes both paths land on it at all
  four viewports; the keyboard path was already right and is still gated separately, because the two
  fail separately.

- **The QR's quiet zone is four modules, carried by `marginSize` rather than by padding.** The
  symbol renders at 270px with a `0 0 33 33` viewBox, so a module is 8.2px and the wrapper's `p-2`
  is 0.98 of one — `marginSize={2}` plus that padding came to 2.98 against the four the format asks
  for. Padding cannot make up a module-denominated shortfall, so the margin carries all four.

- **The slim bar wrapped, and nothing already in the gate could see it.** A wrapped row is not
  clipped, does not scroll the page and overflows nothing; at 375 CSS px a **Share room** trigger
  measured 104px, which put the row 30px over and wrapped *both* the room code and the statistics
  onto second lines — a 44px bar became 69px, out of the card's own height, with every existing
  assertion green. The row is `px-2`/`gap-2` now and the trigger reads **Share** (accessible name
  still "Share room"), which holds one line against the *worst* statistics line rather than the one
  on screen: "24 marks · full house next · 12 here" is 199.7px, the room code 81.7px and the trigger
  55.2px, inside 343px — about 6px of slack. `room.gate.ts` counts the lines against each row's own
  computed `line-height`, so this cannot regress silently again.

- **"The stream is not dropped" is asserted as delivery, not as construction.** `streams()` counts
  every `EventSource` the page ever opened, so a sole source that closed and was never replaced
  still counts 1 and the old assertion passed. A CALL frame is pushed down the stream after the
  dialog has been and gone, and the spotter credit it raises is what says the source is still live.
  (The credit rather than the mark: a mark comes back from the game re-read, and the fixture's call
  log is only appended to by its own `/call` route.)
- **The initial focus needed the real `autofocus` attribute, not React's `autoFocus` prop.** The prop
  is a `.focus()` call at mount, and at mount a closed `<dialog>` is `display: none` — measured, the
  dialog opened on the link (the first focusable) instead of on **Copy link**. The attribute is read
  by the platform's own dialog-focusing steps at `showModal()` and lands on the primary action.
- **Copy is gated as "always answers", deliberately.** WebKit's clipboard permission is not grantable
  from Playwright, so which branch runs is the browser's business; the success/fallback split is
  pinned deterministically in `test/share-dialog.test.tsx`, including the no-`navigator.clipboard`
  case that is the LAN-over-`http` one this fallback exists for.
- **Seeded regression**, in the form this file keeps writing down — rendered is not modal:

  | Seed | What fails |
  | --- | --- |
  | `showModal()` → `show()` in `share-dialog.tsx` | 12 of 68 share tests, 3 per viewport: `closes on Escape and hands focus back`, and both `is whole on screen and thumb-sized` tests via the centring assertion — a non-modal dialog is laid out in flow. Everything else stays green, including `opens on the primary action`: `show()` honours `autofocus` too, so "the dialog appeared and took focus" proves nothing about modality |
  | `onClose` back to `setCopied('idle')` alone | `hands focus back on the touch path too`, and only that one — the keyboard test still passes, because the platform restores what it was given |
  | The trigger's label back to **Share room** | `says where you are without covering the card` at `phone-small`, on the room code's line count. Nothing in `share.gate.ts` moves: the accessible name is unchanged, so every selector still finds it |

- **What moved out of `lobby.gate.ts`.** `wraps the share link rather than overflowing it` is gone
  with the `<p>` it measured; the wrap risk is now the dialog's `break-all` anchor in a ~320px
  column, and `expectNoRowClipped` follows it there. `offers no Start game to anyone but the host`
  asserts the **Share room** button where it asserted the share line.
- **One shared instrument needed scoping.** `room.gate.ts`'s spotter-credit locator was a bare
  `p[role="status"]`, and the dialog carries a live region of its own for the copy feedback. The two
  are never painted together — a closed `<dialog>` is `display: none` — but both are in the
  document, so the credit is located as `p[role="status"]:not(dialog p)` now.

**#87's gate run** (WebKit with `hasTouch`, all four matrix viewports, 234 tests green and 30
skipped — the layout-specific skips — with `re-rolling a clean card` contributing 7 tests per
viewport, 1 of them two-pane only. There is no re-roll dialog to measure: #87 asks for the action to
be immediate, so the consequence is prose in flow and the tap deals straight away):

- **The button is one size everywhere, and it is beneath the card.** The **Re-roll card** button
  measures **115x44** at all four viewports, always below the grid it re-rolls: (4,504) at
  `phone-small`, (4,519) at `phone`, (4,963) at `ipad-11-portrait` and (20,650) at
  `ipad-11-landscape`, where the column is inset by the two-pane padding. The consequence prose
  beneath it is column-wide and wraps to two lines on a phone (367x60 and 382x60) and one on an iPad
  (826x40, 557x40) — no line of it clipped at any of the four.

- **The card never moves, measured rather than reasoned about.** With the control beneath the grid,
  the card's box is **identical** in the clean and the marked stage — 367x367@(4,125) at
  `phone-small`, 382x382@(4,125) at `phone`, 826x826@(4,125) at `ipad-11-portrait` and
  557x557@(20,81) at `ipad-11-landscape`, both stages. The `min-h-11` wrapper is still reserved, so
  what sits *below* the button does not jump 56px (44 plus the `gap-3`) on the first call of every
  game either. `does not shift the grid when a call lands` was not touched and stayed green.

- **The `dvh` cap went from `8rem` to `12rem` and it is a no-op on the matrix.** The reserved row is
  permanent chrome, so the budget had to grow with it. Width binds at every matrix viewport — the
  worst case is `ipad-11-landscape`, where the cap allows 642px and the card measures 557 — so the
  change only does work on a rotated phone (~844x390), which is the short viewport the cap exists
  for and which the matrix does not name.

- **The replacement card is 24 labels no earlier run had graded.** The fixture deals
  `[...CARD.slice(8), ...DECK_EXTRA.slice(0, 8)]` rather than the same set back, keeping
  `Investigation` (13) as the longest word — word length is what a cell breaks on (#47) — and
  `expectNoCellClipped` is re-run against it after the deal. The card's box is unchanged across the
  swap, and `streams()` still counts 1: the view is applied in place, so the screen never remounts
  and the SSE connection it was holding is the one it still holds.

**#108's gate run** (WebKit with `hasTouch`, all four matrix viewports, 247 tests green and 33
skipped — the layout-specific skips, same shape as #87's run; `re-rolling a clean card` still
contributes 7 tests per viewport, 1 of them two-pane only, since this issue moves the control
rather than adding or removing a case):

- **The die is sized from measurement, not CSS, and the header does not know it.** The design
  handoff's own fallback — `aspect-square` on the die against a `flex items-stretch` row, so its
  side tracks the Theme button's stretched height — is what #103's placeholder used and what this
  button tried first. Measured against the WebKit build this project gates against, it does not
  hold: an otherwise-empty flex item with `aspect-ratio: 1/1` and a stretched height measured a
  **0px width** in isolation (`page.setContent` against a bare `<div>`, no app code involved). The
  die's box is set explicitly in pixels instead, from a `ResizeObserver` on the Theme button
  (`die-button.tsx`, `skin-button.tsx`'s forwarded `ref`) — at `phone-small` in Pit Wall this
  measures **25.98×25.98**, identical at all four viewports and both Confetti surfaces, since
  neither Pit Wall's nor Confetti's own real per-skin type/border has landed yet (a later slice's
  work); the *mechanism* is what this issue is answerable for, not a number that moves once those
  skins do. **The relationship is what is asserted**, not the number: `holds the die and the Theme
  button beside the room code and Share` measures both visible boxes and requires the die's height
  *and* width to be within 1px of the Theme button's height, with a `> 20px` floor on the reference
  box so it cannot degenerate into `0 === 0`, re-checked after each of four Theme presses. Nothing
  else here can catch a collapsed or stale die: `toBeVisible()` passes any non-empty box — it passed
  #103's ~2px reserved-slot sliver for a whole slice — and both `expectThumbSized` calls point at
  fixed `h-11 w-11` expanders, which are the same size whatever the die does. Seeded by forcing a
  stale 2px size in `die-button.tsx`, the new assertion fails at all four viewports; unseeded it
  passes.

- **The `deviceScaleFactor: 2` capture** is `docs/design/captures/header-die-108-phone-small@2x.png`
  (the whole slim bar, Pit Wall, `phone-small`) with the glyph alone in
  `header-die-108-glyph@2x.png`. The gate's own projects already run at `deviceScaleFactor: 2`, so
  these are that build's own pixels rather than a separate capture path. Pips read 1-2-4 — one on the
  top face, two on the right, four on the left — and none of the seven touches the silhouette.

- **The shared hit-expander technique has a bug this issue is the first to exercise.** `SkinButton`'s
  `inset-0 m-auto` centring (#103) only ever collapses to its own already-≥44px box, so it has never
  had to centre an expander *larger* than its parent. Measured here — where the die's own ~26px box
  genuinely is smaller than the 44px target — WebKit over-constrains that combination and pins the
  expander's top-left corner to the button's, growing it only right and down rather than centring
  it: `dice hit { x: 195.17 }` sat flush with `dice visible { x: 195.17 }` rather than bled evenly on
  both sides, which by itself made "the die and the Theme button's hit target overlap" seeded and
  real (`gate/room.gate.ts`'s `holds the die and the Theme button beside the room code and Share`).
  Worked around locally in `die-button.tsx` with `left-1/2 top-1/2` plus a `-50%` transform, which
  measures a correctly-centred `44×44` regardless of how the two boxes compare in size.
  `SkinButton`'s own technique is untouched — it still works for every box it has ever had to size.

- **The die-Theme gap is `10px`, not the row's usual `8px`.** The README's own number
  ("`gap: 9–10px` between them") turns out to be load-bearing rather than cosmetic: even correctly
  centred, the die's 44px expander bleeds `(44 − 25.98) / 2 ≈ 9.01px` toward the Theme button, which
  a `gap-2` (8px) row cannot clear. `gap-[10px]` on the three die+Theme rows (join, lobby, game) is
  the fix; the header's own outer `gap-2`/`px-2` — between the control pair and the stats line — is
  unrelated and unchanged.

- **The `dvh` cap goes back from `12rem` to `8rem`.** #87/#112's re-roll slot beneath the grid, and
  the permanent chrome it cost, are both gone — the control lives in the header now, which the cap
  never accounted for separately. Still a no-op on the matrix (width binds at all four viewports);
  it only ever did work on a rotated phone, same as before.

- **Colour is chosen for the surface that exists, not for the one the handoff draws.** Three of the
  four values are the handoff's verbatim: Pit Wall `rgba(232, 232, 234, 0.6)`, Slipstream
  `rgba(255, 255, 255, 0.55)`, Scorecard `#2b2118`. Confetti has **two** values in the handoff —
  `rgba(32, 24, 15, 0.55)` on its cream join bar and `rgba(255, 255, 255, 0.85)` on its blue
  `#2f6bff` card header — and this build has only the first surface: no component paints a blue game
  header yet (#106, the Confetti slice, is what lands it). The rule is "match the muted label beside
  it *in that bar*", so the game header's die keeps the cream bar's dark value here, and #106 adds
  the one-line `svg[data-die-surface='card']` override in the same commit as the background it
  belongs to. Shipping the white value early would have made the die invisible on cream, which is
  the exact bug the per-surface rule exists to prevent.

- **What moves below the card when the first call lands, measured rather than argued.** The
  consequence prose is still `canReroll`-gated in the card column, so it unmounts with the offer:
  at `phone-small`, `Your card` holds its box exactly (`y: 125`, `367×367.02`, before and after),
  while the `What am I looking for` accordion goes `577.02 → 505.02` and the host deck-sheet button
  `634.02 → 562.02` — **72px up** for both, the prose's 60px plus the column's 12px `gap-3`. That
  number is unchanged by #108: #87's `min-h-11` slot was reserved *whether or not the offer stood*,
  so it was the same height on both sides of the call and contributed nothing to the movement;
  removing it shifts this column up once, permanently, and leaves the call-time jump where it was.
  So "nothing below the card jumps" is **not** true and was not true before either — what is true is
  that the grid never moves and the jump did not get worse. Closing it properly means either
  reserving ~72px of blank column for the whole game after the first call, or moving the prose below
  everything else in the column (where `expectWholeOnScreen` fails at `phone-small`, since it lands
  past 667px) — both worse than the movement, so it is left as a known reflow rather than papered
  over.

**#104's gate run** (WebKit with `hasTouch`, all four matrix viewports, 266 tests green and 38
skipped — the layout-specific skips, unchanged in count from #87's run since this issue adds no new
layout-gated surface): Pit Wall retuned to the handoff's real tokens, plus the structural pieces the
app did not have — the join screen's boxed room code, ruled name field and indexed roster; the
card's progress readout; and the earned/inherited cell distinction routed through the skin rather
than left as the app's old hardcoded emerald/grey.

- **The card's own cell/font table is unchanged, confirmed by measurement rather than by argument.**
  This issue's brief says Pit Wall's label face (Roboto Condensed) and cell metrics do not move, so
  the numbers below are pasted from the *same* `sizes its type against the card` run this branch
  and the unmodified `main` both produce byte-identical:

  | Viewport | Cell | Font |
  | --- | --- | --- |
  | `phone-small` | 70px | 11.0px |
  | `phone` | 73px | 11.5px |
  | `ipad-11-portrait` | 162px | 24.8px |
  | `ipad-11-landscape` | 108px | 16.7px |

  The `ipad-11-landscape` figure is **108px / 16.7px**, not the **138px / 21.2px** #13's own run
  recorded — confirmed to be pre-existing drift from #14's/#87's later work on the two-pane column
  widths, not something this issue moved: reverting every change in this branch and re-running the
  same gate against the base commit (8eee6b7) reproduces 108px/16.7px identically. #47's own
  reconciliation table is left as `docs/SURFACES.md` already had it rather than corrected here,
  since correcting it is not this issue's brief.

- **Earned, inherited and unmarked render three distinguishable fills** on a late joiner's card
  (`gate/skin-pitwall.gate.ts`), which is new: before this issue every skin rendered the same
  hardcoded emerald/grey regardless of `data-skin`. **The inherited treatment is invented**, since
  the mocks show only base/marked/free — a materially heavier white wash (`rgba(255,255,255,.2)`)
  with a `.3` border and the label left at full ink, reading as a cell already filled in rather than
  one still open, and not as the cyan that means "you called it" everywhere else in this skin.

  **Measure the composited fill, not the declaration.** This is the assertion's own lesson and it is
  recorded here because it cost a review round: comparing `getComputedStyle().backgroundColor` as
  *strings* passes on any two different declarations, so `rgba(255,255,255,.06)` — the first attempt
  at inherited — sailed through while compositing to `rgb(25,25,26)` against an unmarked cell's
  `rgb(18,18,20)`, seven parts in 255 apart. The gate now walks the ancestor chain to an opaque
  background, composites down to 8-bit sRGB, and asserts a **CIE76 ΔE floor of 12** on all three
  pairs. As rendered at `phone`:

  | Pair | Colours | ΔE |
  | --- | --- | --- |
  | earned vs inherited | `rgb(8,44,41)` / `rgb(59,59,60)` | 16.58 |
  | earned vs unmarked | `rgb(8,44,41)` / `rgb(18,18,20)` | 17.11 |
  | inherited vs unmarked | `rgb(59,59,60)` / `rgb(18,18,20)` | 19.39 |

  ΔE rather than a WCAG contrast ratio, deliberately: at these luminances the mocks' *own* cyan
  earned fill scores 1.25:1 against an unmarked cell, so a contrast threshold either passes
  everything or fails the handoff's own design. The floor of 12 is set from the 17.11 the mocks
  themselves ship, so it sits inside a step the design already accepts.
- **Pit Wall's UI face is set on the skin root, not per component**, matching
  `Bingo Screens.dc.html`, which puts JetBrains Mono on the whole pitwall screen container. `[data-skin]`
  is on `<html>`, so it inherits everywhere except where a descendant declares its own face — which is
  how the card's square labels keep Roboto Condensed (`cardFont.className` sits on the grid itself).
  **It has one measurable consequence, and it is recorded rather than worked around**: a monospace
  face is materially wider at the same size, and at the app's default 14px the re-roll consequence
  gained a line and ran 40px past the bottom of `phone-small`. The fix is the handoff's own type
  scale — secondary prose beside a control at 12px, which is the size its pitwall screens use for
  this copy — not a trimmed sentence or a capped column.
- **The progress readout reads the room's own state and adds none of its own**: 0/24 at lights out
  and 12/24 against the fixture's mid-race stage (`room-fixture.ts`'s own count, not the handoff's
  illustrative 8), both derived from `game.marks.length`/`game.card.length` at render time.
- **The call banner stays docked and unstyled-as-`fixed`**: `expectClearOfTheCard` holds for the
  spotter-credit toast and the undo row, both now Pit Wall's `#141416`/red-border treatment, and
  neither computes `position: fixed`.
- **The accent fill belongs to the join screen's one primary action**, not to every submit button in
  the app. Routing it through the shared `ACTION_BUTTON` constant also red-filled *Re-roll card* and
  *Start game* on the card screen — where the handoff reserves red for the free centre and the call
  banner's top rule and shows no filled button at all — and gave the home screen's two co-equal forms
  two competing full-red primaries. The class (`.skin-action-primary`) is at that single call site;
  the shared constant carries only the 44px minimum every submit button shares.
- **Focus**: the focused outline is `2px solid rgb(255, 46, 46)` — the accent — under
  `:focus-visible`, asserted by colour and width rather than by "some outline exists", since a
  browser's own default focus ring already has a non-zero width and would pass a weaker check for
  the wrong reason. Asserted on **two** elements: the join screen's primary action and a card cell,
  the second because the rule is one selector over `:is(button, a, input, [tabindex])` and a cell is
  what proves it reaches the elements this issue built.
- **Seeded regressions, run and reverted.** Two of them prove the distinct-fills assertion can now
  fail on the thing it claims to measure, which the string comparison it replaced could not:
  inherited set back to `rgba(255,255,255,.06)` fails at `rgb(25,25,26)` against `rgb(18,18,20)`,
  **ΔE 3.31**; set to `rgba(255,255,255,.12)` — a nearer miss, and a fill a string comparison would
  also have waved through — fails at `rgb(39,39,40)`, **ΔE 10.16**, just under the floor. Also:
  `[data-mark='earned']`'s background forced to `--skin-raised` fails the same test on the
  earned-vs-unmarked pair, and the focus rule's selector broken to a non-matching class
  fails `rings the primary action…` on the 2px width. All restored and re-green after.
- **A disclosed copy change.** The handoff's literal button text is "ENTER ROOM"; this issue keeps
  the accessible name **"Enter room"** (sentence case, `text-transform: uppercase` carrying the
  visual) and updates `lobby.gate.ts`'s and `test/room-screen.test.tsx`'s five references from
  **"Join"** accordingly — a genuine, disclosed rename to match the brief's own primary-action copy,
  not a loosened assertion.

**#105's gate run** (WebKit with `hasTouch`, all four matrix viewports — 307 tests green, 41
skipped, up from #104's 266/38; the new file adds 11 tests, one of them `phone-small`-only, which is
exactly `+41` passed and `+3` skipped): Slipstream's own structure lands — the sheared join/card
type, the diagonal line field, the gradient-clipped one-word room code with its sheared bar, the
pill-row roster with its phone-width truncation, the numeral-only progress readout, and the
earned/inherited/unmarked cell distinction — gated in `gate/skin-slipstream.gate.ts`, reusing
`skin-pitwall.gate.ts`'s own `paintedFill()`/`deltaE()` instrument rather than a new one.

- **The card's own cell/font table, this skin's row** (`sizes its type against the card`-style
  numbers, taken from `gate/skin-slipstream.gate.ts`'s own `carries the pool without a cell clipping`
  annotations; cell widths are identical to Pit Wall's — the grid geometry is skin-agnostic — only
  the font size differs, from this skin's own smaller per-skin label-size token):

  | Viewport | Cell | Font |
  | --- | --- | --- |
  | `phone-small` | 70px | 7.0px |
  | `phone` | 73px | 7.3px |
  | `ipad-11-portrait` | 162px | 15.7px |
  | `ipad-11-landscape` | 108px | 10.6px |

- **The label size moved by a per-skin token, `SHRINK_FLOOR` untouched — confirmed by diff**:
  `git diff` against this branch's base touches no line of `card-grid.tsx`. The fix is
  `[data-skin='slipstream'] ul[aria-label='Your card'] { font-size: 1.9cqw; }` in `globals.css`, a
  smaller *starting* size than the shared `3cqw` (`card-grid.tsx`'s own constant, untouched) — Archivo
  900 uppercase is substantially wider than Roboto Condensed at the same size, and the shared base
  still clipped several of the pool's real worst labels even after the existing shrink-to-fit
  algorithm ran to its unmoved floor. `1.9cqw` gives that same algorithm enough headroom to fit
  Archivo's extra width on both the synthetic 30-character/13-character-word cap (`room.gate.ts`'s own
  fixture, reused by `skin-slipstream.gate.ts`) and the committed pool's real worst 24
  (`/legibility`), at all four viewports, with margin left before the floor.
- **The shipped label size undershoots the artboards' own, and cannot not.** The Slipstream artboards
  give card labels `9.5px` (mobile, `padding:4px;line-height:1.08`) and `13px` (desktop,
  `padding:8px`); the table above ships 7.0/7.3/15.7/10.6px — about **26% under at `phone`, 18% under
  at `ipad-11-landscape`**. This is a **spec-vs-reality finding, not a styling choice**: seeding the
  token to `2.4cqw` (roughly the artboard size) fails **all four card tests at all four viewports**
  on `expectNoCellClipped`'s 7px budget, independently reproduced in review. The mocks were drawn
  with short placeholder labels; the committed pool's worst cases are longer, so the artboard size is
  not reachable without the brief's own escalation path (a reword in `themes/f1/overrides.json` plus
  `pnpm pool:build`), which the brief states is a separate issue.
- **Second-order effect of that smaller base, recorded for a batch follow-up:** `SHRINK_FLOOR` is a
  **relative 0.8 factor, not an absolute px floor**, so dropping the starting size from `3cqw` to
  `1.9cqw` moves the *effective absolute* minimum at `phone-small` from about **8.8px to about
  5.6px**. The constant itself is untouched, exactly as the acceptance criterion requires, but the
  floor is **~37% weaker in absolute terms**. Not fixed here — an absolute floor would change every
  skin's shrink behaviour at once — and flagged for the batch rather than left silent.
- **Earned, inherited and unmarked render three distinguishable fills**, gated the same way #104's
  own card is: `paintedFill()` composites each cell's ancestor chain to opaque 8-bit sRGB and
  `deltaE()` scores the three pairs against the same **ΔE 12** floor. **The inherited treatment is
  invented**, since the mocks show only base/marked/free (the same gap #104 recorded for Pit Wall) —
  a heavier `rgba(255,255,255,.22)` wash, hue-neutral against the solid-yellow earned fill and
  distinguishable from the `rgba(255,255,255,.06)` unmarked base by weight alone. Seeded and reverted:
  weakening the wash to `rgba(255,255,255,.07)` (barely past the unmarked base) fails
  `inherited vs unmarked` at **ΔE 0.49**; restored and green again.
- **The primary action's and the Theme button's hit elements are ≥44×44 at `phone-small`, on their
  unsheared expanders.** This skin is the first to put a `transform: skewX()` on an interactive box,
  and a skew on the element Playwright measures would deform its bounding box — so the shear moved to
  an inner "fill" span in both `room-screen.tsx` (`.skin-action-primary-fill`) and `skin-button.tsx`
  (`.skin-theme-fill`), leaving the outer `<button>` — and the Theme button's existing
  `[data-hit-expand]` sibling from #103 — as a plain, unsheared rectangle. A no-op restructuring for
  the three skins with no shear: the classes that used to sit on the button now sit on the fill
  instead, rendering byte-identical.

  **Gated on the computed `transform`, not on a box measurement.** A bounding box cannot see where a
  shear lives: `skewX` leaves height unchanged and only widens the box, so a skew migrating up onto
  the button would make a `>= 44` floor *easier* to clear, not harder. Both tests therefore assert a
  **pair** — `transform: none` on the outer `<button>` (and on the Theme button's `[data-hit-expand]`
  sibling) together with a **non-`none`** transform on the inner fill span. Seeded and reverted:
  moving `skewX(-8deg)` onto `.skin-action-primary` and `skewX(-10deg)` onto `.skin-theme` fails
  **8 tests — both, at all four viewports**; restored and green.
- **The paint overhangs the hit rectangle on the primary action, by design and by ~3px.** With the
  shear on the fill and the `<button>` left square, the painted yellow extends past the tappable
  rectangle at two corners and leaves the other two tappable-but-unpainted (about 3px at a 44px
  height). This is the structurally correct side of the brief's named trap — the hit area must be the
  unsheared box — but the visual affordance no longer traces the tap target exactly, and no test can
  see it. Recorded for the visual pass.
- **Per-viewport type values come from both Slipstream artboards, not one.** The mobile artboard is
  `font-size:96px;line-height:.86;letter-spacing:-.05em` and the desktop one
  `188px;.82;-.06em`, so the room code takes `-.05em` below `834px` and `-.06em` at and above it —
  and likewise `.skin-progress-count` (`-.05em` → `-.06em`) and `.skin-progress-of`
  (`.14em` → `.16em`). All three are genuine per-viewport artboard values rather than rounding, and
  `-.05em` sits inside the brief's own stated `-.02 to -.06em` range, so the HTML wins at phone.
- **The room code is real, selectable text**, not an image, at `phone-small` and every other
  viewport: `textContent` reads `ABCD` regardless of the `background-clip: text` gradient painted
  over it, and a `@supports` guard falls back to solid `#f2ff00` text where the clip is unsupported.
  The gradient itself is one continuous sweep across the four separate `<span>`s `room-code.tsx`
  already renders (unconditionally, for every skin) — `background-size: 400% 100%` plus each span's
  own `background-position-x` (`0%`, `33.3333%`, `66.6667%`, `100%`) is the CSS percentage-position
  formula landing each span on its own quarter of one continuous four-span-wide gradient image.
- **The roster truncates to four names plus a `+N` chip below `1024px`, and shows every name at and
  above it** — `1024px` (Tailwind's stock `lg`) rather than the `834px` "phone vs iPad" swap the rest
  of this skin's type scale uses, because it is the same breakpoint `room-screen.tsx`'s join screen
  already switches its one/two-column layout at. Gated on the fixture's own six-player roster (Ash,
  Bea, Wilhelmina Featherstone, Cal, Dev, Eve): `phone`/`phone-small`/`ipad-11-portrait` show the
  first four plus `+2`; `ipad-11-landscape` shows all six with no chip. Seeded and reverted: widening
  the truncation cutoff from `nth-child(n+5)` to `nth-child(n+9)` leaves `Dev` visible at `phone`
  where the test expects it hidden — fails, then restored and green.
- **No host mark on a pill, disclosed rather than invented.** The handoff's own mock
  (`Bingo Screens.dc.html` #1b/#2b) draws every roster pill identically — plain names, no host
  affordance — which this issue's spec-precedence rule takes over the README's screen-level "with
  host marked": `you` is always `null` on this screen regardless (nobody has joined yet), so only the
  host half of that sentence could ever apply, and the mock the HTML wins over does not draw it.
- **The "looking for" list keeps Pit Wall's hairline separators rather than the handoff's sheared
  accent bars**, and the call banner and background field are otherwise built to the brief. Neither
  is a named acceptance criterion for this issue and both are visual-fidelity gaps rather than
  functional ones — disclosed here and on the issue rather than silently shipped as "done".
- **Two shared components picked up a wrapping span each, with no behavioural change**:
  `progress-readout.tsx`'s numeral is now `<span class="skin-progress-count">` plus
  `<span class="skin-progress-of">` instead of one text run (both still `aria-hidden`, so no
  accessible-name assertion moves), and `room-code.tsx` gained a sibling `<span class="skin-code-bar">`
  after its four character spans rather than a fifth child inside them — `skin-pitwall.gate.ts`'s own
  `code.locator('span')` count of 4 stays true.

**#106's gate run** (WebKit with `hasTouch`, all four matrix viewports, one full
`pnpm --filter @twinion-bingo/web run gate` at default `fullyParallel` concurrency, rebased onto
#105's `097f114`): Confetti to full fidelity, the app's first light surface, plus the blue `#2f6bff`
card-screen header the die-surface comment in `globals.css` had been carrying as "not yet painted"
since #108. **356 passed, 44 skipped (400 listed)** — 49 passed / 3 skipped more than #105's own
307/41 (348) baseline, exactly this issue's 13 new tests × 4 viewports minus the 3 skips its
`phone-small`-only trap test carries at the other three viewports.

- **The card's own cell/font table is a new row, not the old one carried over.** Fredoka is a wider
  face than Pit Wall's Roboto Condensed, and this issue's own `.skin-card-grid` token
  (`globals.css`) is a reduced `2.6cqw` rather than the shared `3cqw` — both named in this issue's
  own "Traps" section as expected. The font is smaller at every viewport, and the cell is now a
  little narrower too, because this skin also carries the handoff's own 5px/7px grid gap (below):

  | Viewport | Cell | Font | Container | font ÷ container |
  | --- | --- | --- | --- | --- |
  | `phone-small` | 69px | 9.5px | 367px | 0.0260 |
  | `phone` | 72px | 9.9px | 382px | 0.0260 |
  | `ipad-11-portrait` | 160px | 21.5px | 826px | 0.0260 |
  | `ipad-11-landscape` | 106px | 14.5px | 557px | 0.0260 |

  `expectNoCellClipped` passes at all four with this reduced size (`skin-confetti.gate.ts`), and
  `/legibility` at `confetti` carries the pool's own worst 24 unclipped too — both mixed-case
  Fredoka's own metrics rather than an assumption carried over from #104's table.

  **The claim asserted is the container-query invariant, not the per-viewport pixels.** The table is
  reported; what the gate holds is `font ÷ container` inside `(0.0255, 0.0265)`, this skin's own
  `2.6cqw` — the same shape of assertion `room.gate.ts`'s `sizes its type against the card` makes for
  the shared `3cqw` at `(0.028, 0.032)`, and a real one rather than the `toBeGreaterThan(0)` this
  test first shipped with. Verified by regression: the token reverted to the shared `3cqw` fails at
  **0.0270** — and note *why* it is 0.0270 rather than 0.0300, which is the second thing this band
  now catches: at `3cqw` `card-grid.tsx`'s shrink-to-fit backstop starts compensating (font 9.909px
  where the token asks for 11.01px), i.e. exactly the "fix it with this skin's label size token,
  never `SHRINK_FLOOR`" instruction in this issue's own Traps. Restored and re-green after.

- **Earned, inherited and unmarked render three distinguishable fills against a *white* cell**,
  measured the same way #104's gate measures Pit Wall's — `paintedFill`/`deltaE`, copied rather than
  imported since neither is exported from `skin-pitwall.gate.ts`. As rendered at `phone`:

  | Pair | Colours | ΔE |
  | --- | --- | --- |
  | earned vs inherited | `rgb(22,163,74)` / `rgb(184,178,169)` | 64.57 |
  | earned vs unmarked | `rgb(22,163,74)` / `rgb(255,255,255)` | 77.26 |
  | inherited vs unmarked | `rgb(184,178,169)` / `rgb(255,255,255)` | 27.70 |

  All three comfortably clear the ΔE 12 floor #104 set. **Inherited is invented**, since the mocks
  show only base/marked/free, same gap #104 found in Pit Wall: a solid ink-tinted grey
  (`rgba(32,24,15,.32)`), composited well clear of both white and the earned green, with the label
  left at full ink (the fill carries the state, not the text).

  **A seeded regression, run and reverted.** Inherited set back to `rgba(32,24,15,.06)` — a
  plausible-looking "faint wash" — fails at `rgb(242,237,228)` against `rgb(255,255,255)`, **ΔE
  7.85**, under the floor. Restored and re-green after.

- **The grid gap is the handoff's own 5px phone / 7px iPad, and it is skin-scoped.**
  `docs/design/README.md`:85 and the HTML at line 670 (phone artboard, `gap:5px`) and line 337
  (desktop artboard, `gap:7px`) agree, so there was no precedence question and no deviation to argue
  — the first version of this slice simply left `card-grid.tsx`'s shared `gap-1` (4px) in place and
  did not say so, which is the omission that then justified halving the bleed.

  The rule is `[data-skin='confetti'] .skin-card-grid { gap: 5px }` plus `7px` at the 834px
  breakpoint. **`card-grid.tsx`'s `gap-1` is deliberately untouched**: the skin selector is
  `[data-skin] .class` (specificity 0,2,0) and beats the utility's single class (0,1,0), so Pit Wall,
  Slipstream and Scorecard keep the 4px their own slices are measured against. Changing the utility
  itself would have moved available cell width under every skin at once — including #105's
  Slipstream label token, which its own review proved is tuned against today's 4px. Confirmed in the
  compiled CSS (`[data-skin=confetti] .skin-card-grid{…gap:5px…}`, with `gap-1` still on the `<ul>`),
  and `skin-pitwall.gate.ts` plus `legibility.gate.ts` (which runs on the default skin) still pass
  `expectNoCellClipped` at all four viewports in the same run.

  **The gap is per skin in the handoff, so the per-skin rule is the right mechanism rather than a
  workaround.** `docs/design/README.md`:85 gives four different values in one breath — "gap 2px
  (`pitwall`) / 3px (`slipstream`) / 5px (`confetti`) / 4px (`scorecard`)" — so a global replacement
  of `gap-1` would be wrong on the spec's own terms and not merely risky for the other slices. This
  rule is therefore also **the seam the other three skins' values can be set at**: #105 shipped
  Slipstream on the inherited 4px where its own artboard
  (`docs/design/Bingo Screens.dc.html`:594) says 3px, which its review let stand as an ungated 1px
  fidelity gap. Deliberately **not** fixed here — another slice's value is another issue's territory
  and would be undisclosed cross-slice scope — but the follow-up is now a one-line rule under
  `[data-skin='slipstream']` rather than a mechanism to design.

- **The earned fill is the handoff's overlay layer at `inset: -2px`, and the *instrument* was taught
  to read it — not the other way round.** The handoff renders a marked cell as an absolutely
  positioned span, `position:absolute; inset:-2px; background:#16a34a; border-radius:14px/20px`,
  behind a re-drawn white label (HTML:674 phone, HTML:341 iPad). An earlier version of this slice
  replaced that with `background-color` plus a zero-blur `box-shadow` because `paintedFill` reads
  `getComputedStyle(node).backgroundColor` and cannot see a pseudo-element — i.e. the design was
  changed to suit the test. That is backwards twice over: it cost the handoff's mark motion (below),
  and it left the instrument blind to any layer-painted state, which is what Scorecard's stamped ink
  ring and Slipstream's wipe-in fill both are.

  `getComputedStyle` takes a pseudo-element argument, so the fix is in the gate: `paintedFill` now
  reads `::before` as the topmost entry of the same compositing stack, with its alpha scaled by its
  own `opacity` — which is also what makes an unmarked cell's overlay (present at `opacity: 0`)
  correctly contribute nothing. The rendering is a `::before` rather than a second element per cell,
  so `card-grid.tsx` keeps its shape. **`paintedFill` is deliberately not lifted into
  `gate/measure.ts`**: it is duplicated across `skin-pitwall.gate.ts`, `skin-slipstream.gate.ts`
  (#105, in review concurrently) and this file, so consolidating it is a FINAL-GATE job, not a change
  to make from inside one slice.

- **The bleed is the handoff's full 2px, and the clearance is measured rather than asserted away.**
  At this skin's own 5px gap, 2px of bleed on each of two neighbours leaves 1px clear — the mocks'
  geometry is self-consistent, so the earlier 1px deviation was self-inflicted by the skipped gap and
  is gone. `does not merge two adjacent bled marked cells at phone-small` reads the bleed out of the
  overlay's own computed `inset` rather than hardcoding it, and asserts **positive clearance** (≥
  0.5px, `measure.ts`'s fractional-layout tolerance) between every pair of painted boxes. The
  assertion it replaced (`expect(overlapX > 0.5 && overlapY > 0.5).toBe(false)`) passed at exactly
  0px clearance — the merged-block state the whole trap is about. Verified by regression: with the
  2px bleed and the gap put back to 4px, the new assertion fails at a measured clearance of **0**.
  Restored and re-green after.

- **The handoff's mark motion is implemented, which is the other reason the overlay is a layer.**
  README:142: "scales the fill from 0.85 to 1 with a slight overshoot
  (`cubic-bezier(.34,1.56,.64,1)`, 220ms) … Unmarking reverses without the overshoot." A
  `background-color` cannot be scaled, which is exactly how this animation went silently missing in
  the earlier version. The overlay carries `transform: scale(0.85)`/`opacity: 0` in the base state
  and `scale(1)`/`opacity: 1` in the earned state; the overshoot curve lives on the earned rule and a
  plain `ease-out` on the base rule, which is what "reverses without the overshoot" means, since a
  transition takes its curve from the state it is going *to*. Gated
  (`scales the earned overlay in with the handoff's overshoot, and out without it`) on the computed
  `::before` duration, timing function, transform and opacity in both states, so it cannot go missing
  a second time. The earned cell also keeps its own white fill under the overlay, as the HTML does —
  which additionally neutralises `card-grid.tsx`'s `bg-emerald-800` fallback class that would
  otherwise be the colour showing around the overlay's edge for the 220ms it scales up.

- **The die is visible on both of Confetti's surfaces**, the reason this issue exists per
  `globals.css`'s own comment: `rgba(32,24,15,.55)` on the cream join/lobby bar (unchanged) and the
  handoff's second value, `rgba(255,255,255,.85)`, now applied via
  `svg[data-die-surface='card']` on the blue `#2f6bff` card-screen header this issue paints — landed
  in the same commit, as that comment asked. `.skin-card-header`'s background measures
  `rgb(47, 107, 255)`.

- **`themeColor` and the iOS status bar were already correct before this issue** — `layout.tsx`'s
  `THEME_COLOR` map and `statusBarStyle` conditional (built in an earlier slice, likely #102/#103)
  already give a `confetti` request `#fffbf2` and `default` rather than `black-translucent`. This
  issue's gate asserts both rather than assuming they still hold: `meta[name="theme-color"]` reads
  `#fffbf2` and `meta[name="apple-mobile-web-app-status-bar-style"]` reads `default` for a request
  carrying the `confetti` cookie. `manifest.ts` is unchanged and still pins to Pit Wall's
  `#0a0a0a` — see that file's own comment for why a static manifest cannot follow a per-request
  skin, restated rather than re-litigated here.

- **The confetti burst gets an explicit palette, read from `<html data-skin>` at fire time.**
  `celebrate()` in `room-screen.tsx` is a module-level function with no access to `RoomScreen`'s
  `initialSkin` prop (itself only ever the *server-rendered* skin), so the live skin is read the
  same place `SkinButton`'s own press already writes it. `['#ff5c39', '#2f6bff', '#ffd23f',
  '#16a34a', '#20180f']` — the skin's own accent, blue, yellow, green and ink — replaces
  `canvas-confetti`'s default mix, which leans pale and is what disappears against `#fffbf2`. Not
  gated mechanically (the library owns the canvas and paints outside anything a DOM query can see,
  same reason #15's own burst criteria are stated in `docs/SURFACES.md` rather than asserted), but
  visually confirmed and the palette is not exercised by any other skin's burst.

- **The host deck sheet reads as distinct from the host's own white card without any change to
  `deck-sheet.tsx`.** Its amber chrome (`bg-amber-950`, `border-amber-500`) is literal Tailwind,
  #102's carve-out for host-only colour, and was never routed through skin tokens — a very dark
  amber against a white card was already a large ΔE before this issue and is asserted as one now
  (`reads as distinct from the host's own white card`, ΔE well over the floor against `rgb(255,255,255)`).

- **The blue card header owns the legibility of everything standing on it.** Painting this ground
  `#2f6bff` is what makes that this slice's job, and `background-color` + `color: #fff` on the
  header alone did not do it: each of the header's children re-sets its own colour from the *light*
  skin's tokens, so a `color` on the parent is overridden three times over. The header now re-points
  the skin's own roles inside its own scope — one declaration per role rather than one selector per
  child, which also reaches every later control mounted there. Measured, composited, on the blue:

  | Thing on the header | Before | After |
  | --- | --- | --- |
  | run status (`text-muted`) | `rgba(32,24,15,.475)` → **2.04:1** | white `.85` phone / `.9` iPad → **3.69:1** / **3.95:1** |
  | Theme button ink | `#20180f` on blue → **3.89:1** | `#20180f` on its `#ffd23f` pill → **12.13:1** |
  | Theme button border | `rgba(32,24,15,.11)` → **1.17:1** (invisible) | `rgba(255,255,255,.35)` → **1.75:1**, or the pill's own edge |
  | focus ring | `--skin-accent` `#ff5c39` → **1.47:1** | `#fff` → **4.50:1** |
  | die (`svg[data-die-surface='card']`) | `rgba(255,255,255,.85)` → **3.69:1** | unchanged |

  The white-at-`.85`/`.9` muted values are the HTML's own (line 664 phone, line 317 iPad), and the
  yellow pill is the handoff's own value for this control in *every* Confetti surface
  (`docs/design/README.md` § *Theme button per theme*, and the HTML draws it in both card headers) —
  not a colour invented to patch a contrast number. It also fixes the same control on the cream join
  bar.

  **The pill is painted on `.skin-theme-fill`, #105's hook — done on the rebase, as flagged.** This
  work was written against `8dd7b53`, where the Theme button's border, padding and type sat on the
  `<button>` itself and the rule therefore used `button[aria-label='Theme']`. #105 moved all three
  onto one inner `.skin-theme-fill` span (so a sheared skin cannot deform `[data-hit-expand]`), which
  made the attribute selector the wrong element twice over: the span's own `border border-rule` and
  `rounded-skin` would keep painting over a yellow button, and any padding would land on a box that
  no longer owns the pill's geometry. The rule is routed through the hook the base now provides — the
  same element Slipstream paints — so the pill is one box again. `skin-confetti.gate.ts`'s pill
  measurements moved with it (`paintedFill` and `color` now read `.skin-theme-fill` rather than the
  `<button>`): the same assertion at the same 4.5 floor, pointed at the box that carries the colours,
  because reading the button would now report the *header's* blue as the pill's ground and the
  inherited white as its ink.

  **The pill's `padding: 7px 15px` remains a disclosed omission — now measured, not argued.** With
  the rule on the fill span the padding became reachable, and the base already ships a per-skin size
  on that hook (Slipstream's `7px 13px`), so it was applied and the gate was run. It fails:
  `room.gate.ts`'s `expectHeaderOnOneLine` breaks at `phone-small` in the Confetti leg of the
  four-skin cycle — `the slim bar's > p holds one line` receiving **1.998**, i.e. the run-status
  paragraph (`0/24 · 6 here`) wrapping onto a second line, because `7px 15px` over the incumbent
  `px-2 py-1` is +14px of width in the tightest row in the app (#103's arithmetic, quoted in
  `room-screen.tsx`, is what forced that line under ~110px to fit this button at `phone-small` in the
  first place). Reverted rather than forced: buying those 14px means relitigating #103's header
  budget, and #108 sizes the die off this button's rendered height on top of that. So the incumbent
  `px-2 py-1` is kept and the legibility defect this rule exists for is carried entirely by the fill
  and the ink. What the rule changes is colour, corner radius and weight — no padding, no border
  width, no font size. The handoff's `font-weight: 600` does move the label's advance width a little,
  so "changes no layout" is a claim about the box model rather than an absolute one, and it is gated
  either way: `expectDieMatchesTheme` (die box vs the Theme button's rendered height, both axes, at
  first render and after each of the four skin presses), `expectHeaderOnOneLine` and
  `expectNoHorizontalScroll` are green at all four viewports in the shipped state.

  **The token re-point is scoped to the header's children, and excludes `dialog` — a real defect,
  found in round-2 review.** Re-pointing `--skin-ink`/`--skin-rule*`/`--skin-accent` inside
  `.skin-card-header` is what makes the blue legible, and a token re-point inherits into *everything*
  in scope. `<ShareRoom>` returns a fragment, so its always-mounted `<dialog>` is a direct child of
  that header (`room-screen.tsx`), and the dialog is `bg-raised … text-ink-strong border-rule` —
  utilities `@theme inline` compiles to the same `var(--skin-*)` roles. The header's white ink
  therefore landed on the dialog's white raised panel: the room code, the share link, and the Copy
  link and Close buttons all at **1.00:1**, invisible, with white focus rings. Completely ungated,
  because `share.gate.ts` runs the default skin. Fixed by moving only the token block down one level
  to `.skin-card-header > :not(dialog)` — the paint stays on the `<header>` — so every control
  standing on the blue still inherits the white roles while the dialog, which stands on its own
  raised panel, keeps the skin's root values. Nothing was restructured.

  New assertion, `keeps the share dialog on the light skin's own ink inside the blue header`, at all
  four viewports. It is a *comparison* and not just a floor, because a floor cannot speak for the
  border: the light skin's `--skin-rule` is `rgba(32,24,15,.11)`, about 1.17:1 on white, so any
  threshold the correct value passes the leaked white one passes too. The lobby renders the same
  dialog with no `.skin-card-header` on the page, so it is the reference — inside the header must
  read identically to outside it — with 4.5 floors kept alongside so "equally broken in both places"
  cannot pass either. The test also asserts `header.skin-card-header > dialog` has count 1, since the
  `> :not(dialog)` scoping is only the right shape while that parentage holds. **Fail-then-pass
  receipt:** run against the pre-fix CSS (token block back on `.skin-card-header` itself) it fails at
  `phone-small` with `the room code (rgb(255, 255, 255)) on the dialog's own rgb(255, 255, 255)
  inside the header` — received **1**, floor 4.5. With the fix: 4 passed (all four viewports).

  **`paintedFill`'s pseudo-element layer now checks coverage, not just presence.** This file's copy is
  the only one that reads `::before` at all (#104's and #105's do not), and it attributed *any*
  `::before` background to the queried node — so `.skin-banner::before`, a 38x38 badge inside a
  full-width banner, would have reported the badge's dark fill as the ground the banner's own text
  stands on. It now counts the overlay only where its used `width`/`height` reach the node's
  `clientWidth`/`clientHeight`: true for the marked cell's `inset: -2px` overlay (4px larger on both
  axes), false for the badge. An unmeasurable box is treated as *not* covering, so the failure mode is
  a missed overlay that the mark tests catch rather than a silently wrong ground — and the three mark
  ΔE tests stay green, which is what proves the used values resolve in WebKit. Flagged for #107
  (Scorecard), which will need pseudo-element support; the copy is deliberately **not** consolidated
  into `measure.ts` (FINAL-GATE's job), but a consolidation must carry this coverage check with it.

  **The roster's "+N" chip is one `<li>` shared with #105, not two.** Both slices independently added
  the same overflow chip to `roster-preview.tsx` under different names — #105's `data-overflow-chip`,
  this issue's `data-roster-more`. The rebase keeps a single element carrying both hooks rather than
  two chips: #105's own gate asserts `roster.getByText('+2')` in Playwright strict mode, which a
  duplicated chip resolves to two nodes and fails. Each skin's CSS still reaches it through its own
  attribute at its own breakpoint (Slipstream `1024px`, Confetti `834px`), and the merged chip is
  **not** `aria-hidden` — #105 shipped it announced, this issue's copy had it hidden, one element
  cannot be both, and since the rows it stands in for are `display: none` (so already out of the
  accessibility tree) the chip is the only remaining signal that names were truncated. Neither skin's
  gate asserts that attribute.

  **New gate coverage, because nothing could see any of this.** The die test asserted the header's
  `background-color` and the die's `color` and stopped, so all four rows above passed unnoticed.
  `keeps its run status, Theme button and focus ring legible on the blue ground` asserts the
  *composited* contrast of the header's text and of its focus ring against the surface `paintedFill`
  reports underneath them, at all four viewports (the muted token is per-breakpoint, so a rule
  landing on only one of the two is a real failure). Verified by regression: run against the
  shipped-today colours it fails at **2.0376:1** on the run status, against a floor of 3.5.

  One consequence worth recording: the die-surface comment's rationale in `globals.css` — the die
  "matching the muted label beside it in that same bar" — is true again. The label beside it is now
  white at `.85`, the same value the die carries.

- **Focus rings are visible on the cream surface, and the accent's contrast ratio is disclosed
  rather than claimed to pass.** `#ff5c39` (the accent, `rgb(255,92,57)`) against `#fffbf2`
  (`rgb(255,251,242)`) measures **2.97:1** — under WCAG's 3:1 minimum for a non-text UI component
  (a focus indicator). The ring is unmistakably visible by eye against the cream ground (it is a
  saturated orange-red on a near-white field, not a low-contrast pastel), but the number is honestly
  short of the guideline threshold; this is the handoff's own accent colour
  (`docs/design/README.md` § *Design tokens* → **Confetti**), not a value this issue chose, so it is
  raised here rather than silently repainted. `expectAccentRing`-equivalent asserts the ring is
  `2px solid rgb(255, 92, 57)` under `:focus-visible` on both the primary action and a card cell.

  For completeness: the ring is **2.97:1** on the cream page surface and **3.07:1** against the white
  cell the card-cell ring actually sits on. The accent is the token, so no spec-conformant value
  clears 3:1 on cream; Confetti's own `#c93c1e` ledge colour would, at **4.90:1**, if an operator
  wants the guideline met — that is a handoff question, not a change this slice makes silently. The
  one ring that *was* this slice's own defect is the same rule on the blue header it invented
  (1.47:1), now white at 4.50:1 and gated — see the header bullet above.

- **"Enter room", not the handoff's "Let's play" — a disclosed deviation, and the earlier
  justification for it was wrong.** This slice originally cited #104's copy change (the row above,
  `Join` → `Enter room`) as precedent. It is not: that was a rename *toward* #104's own brief copy,
  which is the opposite of keeping a name the handoff contradicts. `docs/design/README.md`:69 and the
  HTML (line 645 phone, line 292 desktop) both say "Let's play", and this issue's *Regions* section
  names it explicitly.

  The accurate justification is a deliberate **cross-skin accessible-name contract**: the primary
  action is one `ACTION_BUTTON` with one accessible name across all four skins, and per-skin copy
  would make that name skin-dependent. The cost of changing it is concrete and cross-slice — #104
  already retargeted five gate/test references from "Join" to "Enter room", this issue's own focus
  test queries `{ name: 'Enter room' }`, and #105 is in review concurrently against the same name —
  so a third rename of the same control, from inside the fourth slice, would retarget assertions in
  three slices at once while two of them are still being reviewed. Recorded here as an open FINAL-GATE
  question: either every skin's visible primary-action copy becomes per-skin (with the accessible name
  decoupled from it), or the handoff's per-theme copy is formally superseded by the contract. Not a
  call for one skin slice to make unilaterally, and not one to make silently either way.

- **The roster's "+N" row and the standings' rank circle are both new, unconditional markup.**
  Confetti's own "Roster per theme" truncates the join screen's pill row to four names plus a `+N`
  chip at phone widths (all nine at iPad), and its "Standings" gives each rank a 20px filled circle
  — both structural pieces no skin before this issue had a place to render into, same as #104's room
  code / name field / roster table. `roster-preview.tsx`'s `data-roster-more`/`data-roster-overflow`
  and `results.tsx`'s `skin-standing-rank` are rendered for every skin and painted only under
  `[data-skin='confetti']`; `test/game-screen.test.tsx`'s two standings assertions were updated for
  the rank prefix now in the DOM text (a disclosed, genuine addition, not a loosened assertion).

- **The review round's own run, at full concurrency, green.** After the five findings above were
  fixed, `pnpm exec playwright test` (no `--workers` override, all eight gate files, all four
  matrix viewports) ran **311 passed / 41 skipped, 352 listed, in 31.0s** — no `next start` crash
  this time, which lines up with CI's own full-concurrency pass and further supports the
  resource-ceiling reading in the note below rather than a defect. `pnpm build`, `pnpm typecheck`,
  `pnpm lint` and `pnpm test` (166 web + 154 api passed) are green in the same state.

  Arithmetic, since two tests were added in this round: 352 = the previous head's 344 + the header
  legibility test + the mark-motion test, × 4 viewports. Skips are 41 = the previous 38 + the 3 the
  `phone-small`-only merge test carries on the other three projects, unchanged. Nothing was removed,
  loosened or viewport-narrowed, and `playwright.config.ts` is still untouched.

- **The rebase onto #105's `097f114`, at full concurrency, green.** `pnpm --filter
  @twinion-bingo/web run gate` (no `--workers` override, all nine gate files, all four matrix
  viewports) ran **356 passed / 44 skipped, 400 listed, in 34.7s**, and `pnpm build`, `pnpm
  typecheck`, `pnpm lint`, `pnpm test` (31 theme + 166 web + 154 api passed, 117 api skipped) are
  green in the same state. Arithmetic against the new base: 400 = #105's 348 + this issue's 13 tests
  × 4 (12 carried in, plus the share-dialog assertion the rebase round added); skips 44 = #105's 41 +
  this issue's 3. Both slices' cell-clip coverage is green across all
  three landed skins — `expectNoCellClipped` at all four viewports for `skin-pitwall.gate.ts`,
  `skin-slipstream.gate.ts` (its own two card tests plus the committed-pool one) and
  `skin-confetti.gate.ts` — which is what confirms this issue's skin-scoped 5px/7px
  `.skin-card-grid` gap left #105's `1.9cqw` label token, tuned against the shared `gap-1` (4px),
  undisturbed: `card-grid.tsx`'s utility is unchanged, so only `[data-skin='confetti']` sees 5px.

- **A note on the first round's instability.** A `next start` production server on this machine
  repeatedly crashed (`SIGKILL`) partway through a full `pnpm --filter @twinion-bingo/web run gate`
  at `fullyParallel` concurrency — reproduced twice, unrelated to any one test file (it took down
  already-passing `share.gate.ts`/`skin-pitwall.gate.ts` runs alongside this issue's own). Every
  suite in this run was therefore executed with `--workers=1` against a server this session started
  and confirmed alive (`curl` 200) immediately before each invocation, split across separate
  `pnpm exec playwright test <files>` calls rather than one combined run. All files, all four
  viewports: 303 passed, 41 skipped (344 listed) — 37 passed / 3 skipped more than the 266/38 (304)
  baseline at `8dd7b53`, exactly this issue's 10 new tests × 4 viewports minus the 3 skips its own
  `phone-small`-only trap test carries elsewhere. Nothing in this issue's diff touches
  `playwright.config.ts` or the webServer command, and the crash took down unrelated,
  already-passing files (`share.gate.ts`, `skin-pitwall.gate.ts`) in the same runs — evidence it is
  this machine's resource ceiling under full concurrency rather than something this issue's code
  triggers, though the base commit was not independently re-run to confirm that. Worth an operator's
  attention if CI shows the same instability.

---

**#107's gate run** (WebKit with `hasTouch`, all four matrix viewports, one full `pnpm --filter
@twinion-bingo/web run gate` at default `fullyParallel` concurrency, on top of #106's `d4f9466`):
Scorecard to full fidelity — ruled cream stock, the rotated ticket-box room code, and the ink ring
that marks a square without touching its label. **410 passed, 50 skipped (460 listed** — confirmed by
`playwright test --list`: "Total: 460 tests in 10 files", not inferred from the passed count). The base
commit's own `--list` reports exactly 400; the delta is this issue's 15 new tests × 4 viewports = 60,
all of it in `skin-scorecard.gate.ts`. The fifteenth test is
`the card header › leaves the run-status line real slack, not just one line`, added in the fix round —
see the header bullet below for why a line count was not enough. `pnpm build`, `pnpm typecheck`,
`pnpm lint` and `pnpm test` (31 theme + 166 web + 154 api passed, 117 api skipped on the known
DB-less signature) are green in the same state.

Measured header slack, all four viewports (`available - Range width`, from the new test's own
annotations): `phone-small` **14.36px** (60.53px needed in a 74.89px box, 0.9993 lines), `phone`
29.36px, `ipad-11-portrait` 414.30px, `ipad-11-landscape` 617.84px. The run-status `<p>` is 11px at
phone widths (HTML:741) and 12px at iPad (HTML:414).

**CI history for this slice, recorded because a local run on this branch proved untrustworthy once.**
CI run 32603690712 on head `3cd4e84`: `check`/`db`/`image` green, `gate` **failed** with 2 failures —
the `phone-small` header wrap analysed in the header bullet below, and
`room.gate.ts:1150 › a prize landing › bursts over the card` at `[ipad-11-portrait]` failing with
`locator.tap: Target page, context or browser has been closed`. The second is not an assertion failure
and not attributable to this slice's diff (a pre-existing test this PR does not touch); it did not
cascade, and all 456 tests in that run still executed. It was the **first such occurrence across 20+
consecutive green runs** of this suite, so #106's own local-SIGKILL note does not cover it — that note
is about a production-server crash taking down unrelated already-passing files, a different signature.
No retry was added and no `--workers` override exists anywhere on this branch (CI's 2 workers are
Playwright's own CPU default). See the CI note at the end of this entry for whether it recurred.

- **The card's own cell/font table, this skin's row.** Baloo 2 is the widest of the five faces
  (`docs/design/README.md`'s own note under *Header controls*), so this issue's own
  `.skin-card-grid` token is `1.7cqw` — smaller again than Confetti's `2.6cqw` and Slipstream's
  `1.9cqw`, both named in this issue's brief as expected for the widest face still to land:

  | Viewport | Cell | Font | Container | font ÷ container |
  | --- | --- | --- | --- | --- |
  | `phone-small` | 70px | 6.2px | 367px | 0.0170 |
  | `phone` | 73px | 6.5px | 382px | 0.0170 |
  | `ipad-11-portrait` | 161px | 14.0px | 826px | 0.0170 |
  | `ipad-11-landscape` | 107px | 9.5px | 557px | 0.0170 |

  `expectNoCellClipped` passes at all four with this size (`skin-scorecard.gate.ts`), and
  `/legibility` at `scorecard` carries the pool's own worst 24 unclipped too. The claim the gate
  holds is the container-query invariant (`font ÷ container` inside `(0.0165, 0.0175)`), not the
  per-viewport pixels, the same shape #106's own row uses.

- **A font-metrics defect this issue found and fixed, not a width one.** Baloo 2's rendered glyph
  box (ascent + descent) runs taller than the base `leading-tight` (`line-height: 1.25`) at any size
  this token reaches — measured directly via `getClientRects()`, every one of the pool's 24 labels
  clipped by a uniform ~1.7px at `phone-small`/`phone`/`ipad-11-portrait` regardless of the label's
  own length or word count, which is what said "font metrics", not "too wide": a width problem
  varies with the text, a line-height problem does not. The mechanism: `[data-label]` is a block
  span, so its box height is line-box driven, while `gate/measure.ts`'s `overflow()` compares that box
  against `Range.getClientRects()`, which returns *font-content-area* rects. Baloo 2's ascent+descent
  is ~1.6em, so any line box shorter than that overflows by a constant no narrower `cqw` can touch.
  `[data-skin='scorecard'] .skin-cell` carries the fix (on the cell/button itself, where
  `card-grid.tsx`'s own `leading-tight` sits — a grid-level rule was tried first and silently did
  nothing, since an explicit declaration on the element always beats an inherited one).

  **`line-height: 1.62` is a disclosed spec-vs-reality deviation, and the spec's range is not
  reachable at all.** The handoff gives this cell `line-height: 1.12` (mobile, HTML:749) and `1.15`
  (desktop, HTML:436); `docs/design/README.md`:104 gives `1.08–1.15`. Swept against the pool's own
  worst 24 at `/legibility` at all four matrix viewports — worst overflow in px, `CLIPPED` is past
  `measure.ts`'s own 0.5px budget:

  | `line-height` | 1.12 | 1.15 | 1.25 | 1.40 | 1.50 | 1.52 | 1.54 | 1.60 | 1.62 |
  |---|---|---|---|---|---|---|---|---|---|
  | `phone-small` | +1.51 | +1.42 | +1.11 | +0.64 | +0.33 | +0.26 | +0.20 | +0.01 | +0.00 |
  | `phone` | +1.58 | +1.48 | +1.15 | +0.66 | +0.34 | +0.28 | +0.21 | +0.01 | +0.00 |
  | `ipad-11-portrait` | **+3.40** | **+3.19** | +2.48 | +1.43 | +0.72 | +0.59 | +0.45 | +0.03 | +0.00 |
  | `ipad-11-landscape` | +2.34 | +2.19 | +1.71 | +0.98 | +0.50 | +0.41 | +0.31 | +0.02 | +0.00 |

  So the whole documented range clips real labels, by up to **+3.19px** at the binding viewport
  (`ipad-11-portrait`). Everything at or below 1.52 fails the gate outright; 1.54 clears it by 0.05px,
  which is inside the rounding tolerance rather than clear of the metrics. **1.62 is the measured
  minimum at which the overflow is actually zero**, and it is what ships — leaving the gate's full
  0.5px budget as unused margin. (For the record against the review that asked for this: the
  previously shipped 1.65 was 0.03 above this minimum, not 43% above a reachable one. The value was
  very nearly right; the *disclosure* was what was missing.)

  Why the artboard can afford 1.12 and this cannot: the artboard's cells are static divs holding
  hand-picked short labels under `overflow: hidden`, while these hold the pool's real worst 24 under
  shrink-to-fit. **Second-order cost, disclosed:** a taller line box fits less text per cell and so
  pushes `fitLabel`'s shrink lower — the same effect #105 disclosed for its own token.

- **`fitLabel` measures at a lighter weight than this skin paints.** `card-grid.tsx` fits labels at
  inline `font-weight: 600` ("fitted for the marked weight"), because in every other skin
  `markedStyle()` adds `font-semibold` to a marked cell. Scorecard is the one skin where that
  assumption is inverted: it paints *every* label at 700 via `.skin-card-grid` and leaves the marked
  label untouched, so the fitter now measures a **lighter** face than it renders. No observable defect
  today — `expectNoCellClipped` passes at all four viewports against the pool's worst 24, which is
  the real check — but it means this skin's fitter has slightly less headroom than it thinks, and it
  is the first skin to invert that assumption. Noted rather than changed: `card-grid.tsx` is shared
  and untouched by this slice.

- **The label really does stay untouched when marked, including its weight — a defect this issue
  found before it shipped.** `card-grid.tsx`'s `markedStyle()` is the fallback every skin without its
  own `[data-mark]` override still renders: literal Tailwind colours (`bg-emerald-800`/
  `bg-neutral-700`) *and* `font-semibold`. Without `[data-skin='scorecard']
  .skin-cell[data-mark='earned'], [data-skin='scorecard'] .skin-cell[data-mark='inherited']`
  resetting background/border/ink/weight back to the cell's own base values, a marked Scorecard cell
  would have flipped to the wrong fill and gone bold the moment it was called — the opposite of this
  issue's own "leaves the label untouched" design, and invisible to every test until one specifically
  compared a marked label's computed weight against an unmarked one's (`does not change the label's
  weight when a square is marked`, in `skin-scorecard.gate.ts`).

- **A CHANGE TO THE SHARED GATE HARNESS — `room.gate.ts` now awaits fonts after a skin change.**
  Flagged prominently because it is the one change in this slice that reaches beyond it, and #109
  inherits it. `room-fixture.ts` gains an exported `settleSkinFonts(page)`, and `room.gate.ts`'s
  four-skin cycle calls it after each `theme.tap()` before measuring.

  The defect it fixes: `openRoom`/`openLobby` await `document.fonts.ready` after `page.goto` — which
  is correct for the skin the *document loaded in* (the default, pitwall/JetBrains Mono) and says
  nothing about a skin the test taps into afterwards. Every skin face is `display: 'swap'`, so a
  measurement taken between the skin change and that face being active can grade the layout on the
  fallback face. `settleSkinFonts` names the faces it wants — `document.fonts.load()` with each
  element's own computed `font` shorthand, which forces the matching faces to be requested and
  resolves when they are loaded — then awaits `document.fonts.ready` for anything still in flight.

  **It changes no assertion, no threshold and no viewport.** It only makes the state being measured
  the state the assertions are written about.

  **Honest limits of the evidence, because this was diagnosed as the cause of #107's CI failure and
  it probably is not.** The race could **not** be reproduced locally, including under a deliberate
  1.5s delay injected on every `**/_next/static/media/**` response to simulate a cold runner: the
  header measured `Baloo 2` with identical numbers (60.53px needed / 74.22px available / 0.9993
  lines) with and without `settleSkinFonts`. The reason appears to be that `next/font` preloads all
  seven face files on the initial request (`.next/server/app/r/[code]/page/next-font-manifest.json`
  lists them, all `.p.` preload builds), so by the time a tap activates a face it is served from cache
  and the swap window is negligible. The load-time `document.fonts.ready` also absorbs the injected
  delay. So the most likely cause of the CI wrap is the plain one: **2.17px of slack against ordinary
  cross-platform text-shaping variation** between macOS WebKit and Linux WebKit — 2.17px on 60.53px
  is 3.6%, well inside it. `settleSkinFonts` is kept anyway as correct-by-construction hardening (a
  measurement should not depend on load timing), not because it is proven to be the fix. **The
  load-bearing fix is the 13.69px of slack**, recorded above.

- **The hover lift no longer repaints marked squares.** `README:148` scopes the hover fill shift to
  *unmarked* squares. The rule was `[data-skin='scorecard'] .skin-cell:not(:disabled):hover`, and a
  retractable marked cell is not disabled — so at equal specificity to the `[data-mark]` rule and
  later in the file, hover won and a stamped square lost its own fill under the pointer. Now scoped to
  `.skin-cell[data-mark='none']:not(:disabled):hover`.

- **`.skin-banner` gained the brief's and README:115's `letter-spacing: .18em`** on the "CALLED · 2s"
  label, which the first version omitted.

- **The iPad card gap's source, since it read as unsourced.** `gap: 4px` at phone is HTML:747; `gap:
  5px` at the 834px breakpoint is the **desktop artboard's own grid gap** (HTML:433 —
  `grid-template-columns:repeat(5,1fr);gap:5px`). `docs/design/README.md`:85 tabulates only the mobile
  4px, which is why the pair looks unsourced against the README alone. Both are the handoff's.

- **The ink-ring mark instrument is not `paintedFill`.** `paintedFill`/`deltaE` (copied a fourth time
  from `skin-confetti.gate.ts`, per this issue's own instruction to keep the FINAL-GATE
  consolidation out of scope) proves two *fills* are different; Scorecard's mark is a **border-only**
  `::after` — the cell keeps its own `#fffdf7` background in every state — so `paintedFill` would
  read the exact same white for earned, inherited and unmarked alike and pass against a version of
  the CSS with no ring at all. `skin-scorecard.gate.ts`'s own `ringColour()` reads the `::after`'s
  `border-color`/`opacity` directly instead — the actual painted property carrying the mark — and
  `null` stands for "no *visible* ring".

  **Correction to this entry's first version, which stated the wrong reason.** It said an unmarked
  cell "has no matching `[data-mark]` selector at all". That is false: the base rule is
  `[data-skin='scorecard'] .skin-cell[data-mark]::after`, an attribute **presence** selector, and
  `card-grid.tsx` renders `data-mark="none"` on unmarked cells — so an unmarked cell *does* match and
  *does* get a `::after` box with the ring's full geometry. What makes it invisible is the
  `opacity: 0` (and `border-color: transparent`) on that base rule, which is the resting pre-stamp
  state asserted by the mark-motion test. So `ringColour()`'s `opacity === 0` guard is the entire
  reason it returns `null` for unmarked. The assertion was always correct; the account of *why* was
  not, and an instrument the batch's colour story rests on must not ship with a wrong one. Two
  known limitations of the `paintedFill` instrument this issue had to work around rather than trigger
  are recorded in `skin-scorecard.gate.ts`'s own comments: it cannot see a border at all (only a
  covering `background-color`), and it always treats a queried pseudo-element as topmost regardless
  of real paint order — the ink ring is built to be genuinely topmost (a `position: absolute`
  `::after` with `z-index: auto`, painted after the label's own non-positioned content by CSS's
  ordinary painting order, with no `z-index` needed on the label itself) specifically so that second
  limitation never has a wrong answer to give.

- **Inherited is a second ink colour, not an unclosed ring** — the brief's own two options, and the
  mocks show only base/marked/free (the same gap #104/#105/#106 each record for their own skin).
  `#1f7a6b`, this skin's own teal, already carries the meaning "the room did this, not you" (the
  primary action's fill, the call banner's fill) — reused here so the inherited ring reads as "this
  happened, but you did not call it" by hue alone, since the fill is not available to this skin's
  marked state at all. `skin-scorecard.gate.ts`'s own distinctness test is a `deltaE` on the two
  rings' own colours (ΔE well past the 12 floor: orange vs teal), not a fill comparison.

- **A budget defect this skin's own Theme button caused, and the fix this issue disclosed rather
  than hid.** The handoff's own `.skin-theme-fill` entry for Scorecard is `padding: 5px 12px` — fuller
  than the incumbent `px-2 py-1` (8px/4px) — plus, for the first time among the four skins, a 2px
  border on this control. Baloo 2 on top of both pushed the card-screen header's run-status `<p>`
  down to ~53px of available width at `phone-small`, which no font size that stays legible fits —
  `room.gate.ts`'s own `expectHeaderOnOneLine`, which cycles every skin including this one, failed at
  1.999 lines before the fix. The same trap #106's own comment on this exact hook records for
  Confetti's `7px 15px`. Fixed the same way: the incumbent `px-2 py-1` is kept (no padding override),
  and the run-status `<p>` drops from the unskinned `text-xs` (12px) to `11px` at phone widths — a
  type-scale correction, the same kind Pit Wall's own `.skin-note` comment describes for JetBrains
  Mono, not a layout change. Both values are the artboards' own: `11px` is the mobile artboard's
  (HTML:741) and `12px` is the desktop artboard's (HTML:414), so the iPad block restores `12px` where
  the row has the width for it. The 2px border on this control costs the row twice — its own width
  *and* the die's, since `die-button.tsx` sizes the die off this button's rendered height — and is
  kept, because the 2px ink border is the skin's defining token.

  This padding deviation is **not** on its own what made the header fit: see the bullet below for the
  2.17px of slack it left behind and what CI did with it.

- **The header renders on one line at `phone-small` — and the first version of this entry proved
  that "one line" is the wrong thing to measure.** CI run 32603690712 failed
  `room.gate.ts:358 › holds the die and the Theme button beside the room code and Share` at
  `[phone-small]`, on the Scorecard leg of the skin cycle (`room.gate.ts:424`), with `1.9985` line
  boxes against `<= 1.01`. It passed locally. The reason is that the row had **2.17px of slack** and
  nothing could see it: `expectHeaderOnOneLine` is a cliff, reading identically at 2px of spare width
  and at 20px, and saying nothing at all until the row has already wrapped.

  The `<p>` is the header's only `flex-1` child, so it is handed exactly what the h1, Share and the
  control group leave behind. Measured at `phone-small` (375px, `13px 16px` padding, `gap-2`):

  | | h1 box | `<p>` box | text needs | slack |
  |---|---|---|---|---|
  | shipped in CI run 32603690712 (`letter-spacing: .08em`) | 96.26px | 62.70px | 60.53px | **2.17px** |
  | now (`letter-spacing: normal` at phone) | 84.75px | 74.22px | 60.53px | **13.69px (22.6%)** |

  **The deviation, disclosed:** the h1's `letter-spacing: 0.08em` (HTML:740) is dropped at phone
  widths and restored at iPad (HTML:414, in the `min-width: 834px` block). The justification is that
  the artboard's header is not this header — HTML:740 carries a bare 4-character code (`K4V2`), one
  stat (`Lap 34`), the die and the Theme button, while the real header carries `Room ABCD` (9
  characters), `0/24 · 6 here` **and** a Share button. The artboard's tracking was never budgeted
  against this row's contents, and 11.5px of tracking on a 9-character string is the cheapest width
  in the row.

  For scale on how much margin 13.69px is: the *fallback* face renders the same string at 67.52px
  against Baloo 2's 60.53px, so the row now holds one line even in the swap state — i.e. the fix is
  robust to the whole per-face delta, not tuned to a boundary.

  **New assertion, so this cannot recur silently:** `skin-scorecard.gate.ts`'s
  `the card header › leaves the run-status line real slack, not just one line` measures the margin
  itself (`available - Range width`) at all four viewports and fails below a 4px floor. Restoring
  `letter-spacing: .08em` fails it locally at `phone-small` (`needs 60.53px in a 63.38px box`), which
  is precisely the regression CI caught and local runs did not.

- **The 34px Theme button is NOT shipped, and that is the cost of the disclosed padding deviation.**
  The handoff tabulates a 34px Theme button for this skin; the button measures **~28-30px**. It is
  not met, and it cannot be while the padding deviation above stands, because the handoff's own
  `padding: 5px 12px` is exactly what was dropped to buy the header its width back. The acceptance
  criterion's "(34px)" parenthetical is therefore unmet as written — recorded here rather than left
  to read as satisfied. What *is* asserted is the relationship the criterion is really about: the die
  is sized from the Theme button's own rendered height via `die-button.tsx`'s `ResizeObserver`, not a
  constant, and comes out within the room's 1px tolerance of it at whatever height the button
  actually has.

- **A structural change this issue made to two shared components, both class hooks, no behavioural
  change.** `room-screen.tsx`'s join-screen name-field `<label>` gained a `skin-field-label` class
  (styling hook for this skin's own "SIGN HERE" visual weight; every other skin renders it exactly as
  before), and the join screen's two-column wrapper gained a `skin-join-divider` class (this skin's
  own dashed desktop divider; Pit Wall's hairline and Slipstream/Confetti's plain `border-rule` are
  untouched, since none of their own rules target the new class).

- **A disclosed copy deviation, and it rests on an OPEN FINAL-GATE QUESTION — not on precedent.**
  The first version of this entry called it "this screen's own established precedent". That was wrong,
  and it was wrong in exactly the way #106 was already pulled up on. **`docs/SURFACES.md`:1234-1250
  (written in #106's round-2 review) explicitly rejects that framing**: #104's `Join` → `Enter room`
  rename was a change *toward* #104's own brief copy, which is the opposite of keeping a name the
  handoff contradicts. That entry records the accurate justification — a cross-skin
  **accessible-name contract** — as an **open FINAL-GATE question**, and it is still open. Nothing
  about it is settled, and this slice does not get to settle it.

  The handoff's literal copy for this skin is "Take a card" (primary action), "SIGN HERE" (name-field
  label), "Admit one to room" (room-code label), and "Already signed in" (roster heading). This slice
  keeps the existing DOM text for the primary action, and extends the same unresolved call to **two
  further controls**:

  | handoff copy | DOM text kept | control |
  |---|---|---|
  | "Take a card" | "Enter room" | primary action (`ACTION_BUTTON`) — already under the open question |
  | "SIGN HERE" | "Your name" | join-screen name-field `<label>` — **added by this slice** |
  | "Already signed in" | existing roster heading | join-screen roster heading — **added by this slice** |

  Both additions are listed here so the FINAL-GATE operator sees the full extent of what is deferred:
  the open question now covers three controls across four skins, not one. The mechanism that argues
  for keeping them is unchanged and is the only justification offered — `apps/web/test/` and every
  gate query one accessible name per control across all four skins, so a per-skin rename is a
  cross-slice retarget of assertions in slices still under review, not a CSS change. The mechanism is
  a *reason to defer*, not a licence; either every skin's visible primary-action copy becomes
  per-skin with the accessible name decoupled from it, or the handoff's per-theme copy is formally
  superseded by the contract. Not a call for a skin slice to make unilaterally, and this slice does
  not claim to have made it.

  "Admit one to room" is the one piece that is genuinely uncontested: it is new decorative text on
  `.skin-code-bar::before` (`aria-hidden`, the same technique #106 used for its own "Room code"
  label), so nothing existing carries that string and no accessible name conflicts with it.

- **The rotated ticket box, checked at its own worst viewport.** `transform: rotate(-2.5deg)`
  inflates the room code's bounding box, and a transform is invisible to `scrollWidth` — this issue's
  own named trap. `skin-scorecard.gate.ts`'s own test measures the ticket's real `boundingBox()`
  against the viewport at `phone-small`, on top of the existing `expectNoHorizontalScroll` (which is
  `overflow()`-based, not `scrollWidth`-based, so it already covered the page as a whole).

- **The ruled-paper gradient is on `body`, the deepest layer in the stack, not an overlay.** Same
  technique Slipstream's own diagonal field uses. A card cell's own `background-color:
  var(--skin-raised)` (`#fffdf7`) is opaque and paints in the normal flow above `body`'s background,
  so there is no compositing question at `deviceScaleFactor: 2` (this issue's own named trap) — the
  gate's own screenshots at that scale factor show no bleed-through, and nothing measures a colour
  through an opaque cell regardless.

- **This is the one skin where a marked label being bolder does not apply, confirmed rather than
  silently skipped.** Every other skin's `markedStyle()` fallback (or its own `[data-mark]` override)
  makes a marked label `font-semibold`, which is why "a label that fit unmarked has to be re-checked
  marked" is a standing rule here. Scorecard's mark is entirely an overlay — the label's own weight is
  reset to this skin's one value (Baloo 2 700) in both states — so the rule's premise does not hold
  for this skin specifically, said out loud in `skin-scorecard.gate.ts`'s own test and in this issue's
  PR rather than left as a silent omission.

**#109's gate run** (WebKit with `hasTouch`, all four matrix viewports, one full `pnpm --filter
@twinion-bingo/web run gate` at default `fullyParallel` concurrency, on top of #107's `773ca28`):
the visual gate becomes skin-aware. `apps/web/gate/room-fixture.ts` gains `forEachSkin`, seeding the
`twinion_bingo_skin` cookie before the caller's own `openRoom`/`openLobby`/`page.goto` — the
server-rendered `data-skin` path, per this issue's own brief, rather than the button. A new file,
`apps/web/gate/skin-matrix.gate.ts`, holds the matrix itself.

- **Test count, listed rather than inferred from passed.** `playwright test --list` reports **460**
  at the base commit (410 passed / 50 skipped, confirmed independently by running the base commit's
  own gate: 410 passed, 50 skipped, 40.9s) and **476** at this issue's head (423 passed / 53 skipped,
  confirmed by an actual run: 423 passed, 53 skipped, 42.1s). Net new: **16 tests**, all in
  `skin-matrix.gate.ts` — four `test()` blocks × four viewports, matching four `describe`s below
  exactly. Skips went from 50 to 53: the two-pane test (below) is skipped at the three viewports that
  are not `ipad-11-landscape`, the same convention `room.gate.ts`'s own `twoPane()` skips use.

- **Wall-clock, full suite, before and after — 40.9s to 42.1s.** The matrix's own 16 tests cost about
  1.2s of the run, not the ~576-test, multi-minute suite a naive "run everything at four skins" would
  have been. `skin-matrix.gate.ts` alone (16 tests, `--workers=2`): 13.9–14.2s across three runs.

- **What the matrix actually runs, and why nothing more.** Four `test()` blocks, each looping
  `forEachSkin` inside a single test body rather than as four separate `test()`s — so the matrix's
  cost is (assertion groups) × (viewports), not (assertion groups) × (viewports) × (skins):

  1. **`clips no cell, marked or unmarked, at any skin`** — `expectNoCellClipped` and
     `expectNoHorizontalScroll` at both `start` (all 24 unmarked) and `mid` (earned, inherited and
     still-open cells together), per skin. Two stages rather than one: #13's own history is a cell
     fitted for the *marked* weight that only re-fits when a label's text changes, so a defect
     specific to the marked state is invisible to a run that only ever opens `start`.
  2. **`keeps every control thumb-sized and the header on one line`** — `expectThumbSized` on the
     die's, the Theme button's and the Share button's hit elements, plus the header's own line count
     (the same `h1`/`> p` measurement `room.gate.ts`'s `expectHeaderOnOneLine` makes), at `start`
     (where the die is offered), per skin.
  3. **`does not scroll the page, and keeps the right pane beside the card`** —
     `expectNoVerticalScroll` and `expectBesideTheCard`, `ipad-11-landscape` only, per skin.
  4. **`carries its own worst 24 labels without a cell clipping`** — `legibility.gate.ts`'s own claim
     (`expectNoCellClipped` + `expectNoHorizontalScroll` on `/legibility`), swept across all four
     skins rather than only the default: the per-skin label tokens named in the cell/font table above
     are exactly what this test exists to catch a future one of breaking.

  **What was deliberately left out, so a silent cap does not read as "covered everything":** colour
  (`paintedFill`/`deltaE`/`ringColour`) stays gated per-skin in each skin's own file, not swept here —
  this issue's brief does not ask for a fifth colour instrument, and consolidating the four existing
  ones is an open FINAL-GATE item (`docs/adr/0009-skin-css-variable-layer.md`). `expectDieMatchesTheme`
  is not re-swept by cookie: `room.gate.ts`'s own `holds the die and the Theme button beside the room
  code and Share` already cycles all four skins by *pressing* the button, at all four viewports — the
  same four-skins-by-four-viewports shape, and adding a cookie-seeded copy of the identical assertion
  would be the duplicate this issue's own acceptance criteria rule out. Only `mid` and `start` are
  swept for cell clipping (not `done`) and only `mid` for the two-pane pair — `room.gate.ts` already
  covers the other stages once, at the default skin, and a skin's CSS cannot re-introduce a
  stage-specific defect a viewport-only assertion would.

- **The "reaches a skin by pressing the button" criterion is met by an existing test, not a new
  one — found by reading `room.gate.ts` before writing anything, as the brief asks.**
  `re-skins across four presses without dropping the stream` (added by #103, `8eee6b7`) already does
  exactly what this issue's acceptance criterion 3 asks: it presses the Theme button through a full
  cycle at `phone`, asserts `streams()` is still `1` (no remount), and pushes a `CALL` frame afterwards
  to prove the timeline still grows. Adding a second test that reaches a skin by cookie and then
  presses the button once would duplicate an assertion already in the suite — the very thing this
  issue's own acceptance criteria (`No new assertion duplicates an instrument already in
  gate/measure.ts`) and this file's own history of near-duplicate instruments argue against. No new
  test was added for this criterion; the existing one is cited here so its coverage is on the record
  against this issue rather than only against #103's.

- **A seeded regression, run and reverted, proving the matrix catches a break at one skin only.**
  `[data-skin='confetti'] .skin-cell { padding: 14px }` (Confetti's cell base rule in `globals.css`,
  which carries no padding of its own today — the shared `p-1` Tailwind utility is what every skin's
  cell padding comes from) squeezes Confetti's content box hard enough to clip real labels while
  leaving the other three skins' cells untouched. Re-run with the seed in place:

  ```
  4 failed
    [phone-small] › skin-matrix.gate.ts:67:3  › the card, at every skin › clips no cell, marked or unmarked, at any skin
    [phone-small] › skin-matrix.gate.ts:148:3 › legibility, at every skin › carries its own worst 24 labels without a cell clipping
    [phone] › skin-matrix.gate.ts:67:3        › the card, at every skin › clips no cell, marked or unmarked, at any skin
    [phone] › skin-matrix.gate.ts:148:3       › legibility, at every skin › carries its own worst 24 labels without a cell clipping
  3 skipped
  9 passed (14.2s)
  ```

  Every failure's own `test.step` trace names `confetti` — `pitwall`, `slipstream` and `scorecard`
  passed in the same run, at the same viewports, which is the claim "catches it at that skin only"
  actually means. Confetti's own test labels overflowed by +0.8px to +9.5px depending on the label
  (`skin-matrix.gate.ts`'s `expectNoCellClipped` output, e.g. `"Championship lead changes (+9.5px)"`
  at `phone`). Not caught at `ipad-11-portrait`/`ipad-11-landscape` — the wider cells there have
  enough headroom to absorb 14px of padding on this pool's labels, the same "caught at one viewport
  out of four, and that is the geometry rather than a weak assertion" shape #14's own stacked-columns
  seed recorded. Reverted; the full `skin-matrix.gate.ts` run is green again (13 passed, 3 skipped,
  14.0s).

- **No `scrollWidth` in the diff**, and no new colour or die-sizing instrument duplicating
  `gate/measure.ts` or an existing `skin-*.gate.ts` file's own — every assertion in
  `skin-matrix.gate.ts` calls an instrument already exported from `measure.ts`.

## Adding a surface or a screen

Add the row when the screen lands, in the same PR. A screen that exists and is not in this table is
a screen nobody will check, which is the situation this file was written to end.
