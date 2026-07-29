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
