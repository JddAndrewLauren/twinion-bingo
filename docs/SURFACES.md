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
- **Toolset:** Playwright, driving a real viewport with `page.setViewportSize`. Never
  `chrome --headless --screenshot` — the viewport renders at the wrong size and the captures lie.
- **Gate:** launch `pnpm --filter @twinion-bingo/web dev` against a running API, then capture each
  screen below at all four matrix viewports and review for clipping, overlap, broken wrapping, and
  sticky/scroll or focus glitches.

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
| Game — spotter toast  | `/r/:code`, just after a CALL arrives            | The toast pinned to the bottom crediting the spotter by name, **covering no part of the card**, and wrapping rather than overflowing on a long name plus a 30-character label |
| Game — prizes         | `/r/:code`, a game with rungs of the ladder won  | The **Prizes** list under the card: each rung named in words ("first line", "two lines", "full house") against its winner, and co-winners of one rung as separate lines |
| Game — standings      | `/r/:code`, a live game with calls in it         | The **Standings** list: every player's name against a right-aligned raw mark count, the name truncating rather than pushing the number off the row on a 24-character name |
| Game — final standings| `/r/:code`, `state === 'done'` after a full house | The same list headed **Final standings** rather than **Standings**, so the room can tell a finished game from a live one without reading the card |
| Game — timeline       | `/r/:code`, a game with calls in it              | The **Timeline**, newest first: a fixed-width `+MM:SS` stamp column that stays a column, with each row's text wrapping *within its own column beside the stamp* rather than running under it |
| Game — late joiner    | `/r/:code`, joined mid-game, a line already up   | The card's **greyed** inherited marks reading as distinct from both an earned (emerald) mark and an unmarked cell at a glance — a line already complete at join must not look claimable |
| Game — results under the toast stack | `/r/:code`, a local undo open *and* a remote credit arriving, over a populated results panel | Both bottom rows stacked and unclipped, neither covering the card, and the timeline still reachable by scrolling out from under them |
| Game — host deck sheet | `/r/:code`, a live game, joined as the host, sheet open | All 40 deck rows, called ones telling apart from uncalled at a glance, **the amber admin chrome distinguishing the sheet from the host's own card**, and the toggle back to the card reachable |
| Game — undo toast     | `/r/:code`, within 10s of **your own** call      | The toast pinned to the bottom naming the square you called with the **Undo** button beside it — the button on the toast rather than below it, thumb-sized, and neither the label nor the button overflowing on a 30-character label; **covering no part of the card**. The host's own call from the deck sheet opens the same window, so the toast has to sit over the sheet without hiding a row's Call affordance |
| Game — credit over undo | `/r/:code`, a remote CALL arriving while your own undo window is open | **Both rows on screen at once** — the spotter credit stacked above the undo row rather than replacing it — still bottom-pinned, still **covering no part of the card**, and the **Undo** button still reachable beneath the credit |
| Game — retract dialog | `/r/:code`, tapping a marked square you may correct | The confirmation centred over the dimmed card: the prose naming the square and saying it unmarks for everyone, with **Take it back** and **Keep it** both on screen without scrolling |

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
- **Neither "latent" nor "12 of 24" is right.** The committed 47-square F1 pool's longest single
  word is **exactly 10 characters**, and no label exceeds it — which is why #8's and #10's runs
  passed on real labels, and why nothing is broken on screen today. But that is zero headroom, not
  safety: #16 authors this pool to ~180 squares, and *investigation* (13), *championship* (12),
  *disqualified* (12) and *reprimanded* (11) are ordinary motorsport vocabulary.

Tracked as **#47** rather than left as prose here. Two things belong in it: the iPad font ceiling,
and the gate method, since the `scrollWidth` assertion this file recommends is what hid the problem
three times — see #47's second half before writing another card gate.

### Known-unverified claims inherited from #4

These are the criteria that were signed off by eye. Any gate run should confirm them explicitly
before treating them as settled:

- The room code **and share link** at phone width — the link is a full `https://host/r/CODE` and is
  rendered as body text, so long deploy hostnames are the wrapping risk.
- The roster's `(host)` and `— you` suffixes — currently bare string concatenation inside the `<li>`,
  with no styling to keep them distinct from the player's name.
- The home screen's two stacked forms at `phone-small`, inside a `min-h-dvh` centred column.

## Status of the toolchain

**Playwright is not yet a devDependency of this repo** — the gate above is specified but not yet
runnable, and no CI job runs it. Adding it belongs to **#12** (prototype the room screen on phone
and iPad), which is the first issue that needs it and will know more about the harness than this
file does. Until then the matrix and the screen inventory are still the contract: an issue can
write acceptance criteria against a named viewport, and whoever verifies does it manually at that
exact size rather than at whatever their window happens to be.

## Adding a surface or a screen

Add the row when the screen lands, in the same PR. A screen that exists and is not in this table is
a screen nobody will check, which is the situation this file was written to end.
