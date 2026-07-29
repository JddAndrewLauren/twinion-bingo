# Prototype: the room screen on phone and iPad (#12)

**Throwaway.** Delete this whole folder once the verdict below is filled in and recorded on #12.
Nothing here obliges #13 or #14 beyond that verdict.

## The question

D14 commits to two layouts, phone and 11" iPad, and says so as a starting point rather than a
decision. Two things have to come out of this:

1. **Is a 68pt cell legible at 390pt portrait** — about 5 characters per line by D4's arithmetic.
   This cannot be settled in a resized desktop browser, which is why this exists.
2. **Does the landscape iPad want a layout of its own**, given that an iPad propped next to the TV
   is plausibly the primary device rather than a stretched phone.

And a consequence to decide either way: **does the <=30 character label cap need to tighten?**

## Running it

```
pnpm --filter @twinion-bingo/web dev
```

Then `http://<your-lan-ip>:3000/prototype/room` on the actual hardware. No API, no database, no
token — it is mock state end to end.

- The fuchsia bar at the bottom has an **A / B / C** button each — tap one. Arrow keys work too, on
  desktop. Or set `?variant=A|B|C|C1|C2|C3` by hand. The bar collapses to a single handle once you
  pick, because expanded it sits over whatever is at its height — which on a phone is the element
  being judged. Tap the handle to bring it back.
- `?labels=cap` (default) — plausible labels **at** the 30-character cap whose longest words are
  11-13 characters: `investigation`, `championship`, `disqualified`, `reprimanded`.
- `?labels=real` — the committed 47-square pool's own longest labels, longest word 10. The control.
- `?stage=start` (bar: **lights out**) — nothing called, so the list is all **24** rows. This is the
  list's worst case *and* the only state where the longest descriptions are on screen at all, because
  the list carries open squares and `mid` has already marked the squares whose prose runs longest.

**Judge on `cap`.** `real` is what is on screen today; `cap` is what #16 will author.

### If the switcher does nothing

It must be `pnpm ... dev`. The bar is gated on `NODE_ENV !== 'production'`, so under `next build && next
start` it renders as nothing at all and the variants are only reachable by editing `?variant=` in the
address bar. That gate is deliberate — it is what stops a stray merge shipping the bar — but it does
mean a production build looks like a broken prototype.

## The variants

| | Premise | Phone | `ipad-11-landscape` |
| --- | --- | --- | --- |
| **A** | D14 as written, built literally so there is something to beat | Slim top bar, full-bleed card, swipe-up sheet, toast stack | Two-pane: card left, 320px standings/timeline rail right |
| **B** | The card is the screen. Cell size is the whole problem, so spend everything on it | No bar — a floating pill over the card is the only chrome, and it opens a full-screen race overlay | Same layout, not a different one: a square card filling the shorter axis |
| **C** | The card is not the primary surface. Two co-equal things, neither ever covering the other | Segmented control, Card \| Race, each a whole screen — no sheet, no overlay, no gesture | True 50/50 split, the race read at full size rather than as a rail |

**C won**, so C1-C3 vary one element inside it: the "what am I looking for" list. Plain **C** is kept
as the baseline with no list at all, because "is the list worth its space" is itself one of the
things to judge. C1 and C2 share C's skeleton deliberately — with the layout already chosen, holding
everything else identical is what keeps the comparison about the list rather than about drift.

| | Where the list lives | Disclosure | The bet |
| --- | --- | --- | --- |
| **C1** | Phone: under the card. **Landscape iPad: a tab in the right column, open by default** | Phone: one block, shut by default. iPad: none | You consult it between events on a phone; propped by the TV it is the first thing you want |
| **C2** | Under the card, on the Card tab | Labels always listed; prose one row at a time | "What is still out there" is a glance; prose is only wanted for the square being argued about |
| **C3** | Its own phone tab, and the iPad's left column | None at all | It is a third surface, not a footnote to the card — and the argument about how much to hide only exists because it was in the wrong place |

### C1's two layouts, which disagree on purpose

C1 is the chosen shape, and its phone and landscape-iPad layouts now put the list in
different places, because the devices differ in room and in posture:

- **Phone / portrait iPad** (below `lg`) — one collapsible block under the card, shut by default.
  The card keeps the screen until asked. The count in the heading is the only part readable while
  it is shut.
- **Landscape iPad** — not under the card at all. The right column is tabbed, **Looking for** and
  **Race**, opening on *Looking for*: early in a race what you want is what to watch for, not a
  timeline of things that already happened. The left column is the card alone, so it never moves.
  Measured at `ipad-11-landscape`: all 12 open squares and their prose fit the column without
  scrolling.

**The cost to weigh:** standings and the timeline are now one tap away on the iPad rather than
permanently visible, and permanent visibility was the thing plain C was best at.

### What the list is

Open squares only — a marked square is answered, and leaving it in would make the list longest at the
moment it is least useful. It shrinks from 24 rows at lights out to nothing at a full house, which is
a progress read for free. Inherited marks are marked, so they are not open and stay out.

**No model change needed.** `CardSquare` already carries both fields (D4: `label` <=30 chars for the
cell, `description` for the long press), so the list is a rendering change and nothing more.

## What was measured before handover

Playwright, `page.setViewportSize`, all four `docs/SURFACES.md` viewports, both label sets. Overflow
measured with a `Range` over each cell's text against its content box — **not** `scrollWidth`, which
`SURFACES.md` records as having hidden this exact problem three times.

| Variant | `phone-small` | `phone` | `ipad-11-portrait` | `ipad-11-landscape` |
| --- | --- | --- | --- | --- |
| A | 70px / 7.9px | 73px / 8.2px | 162px / 17.8px | **114px** / 12.6px |
| B | 70px / 7.9px | 73px / 8.2px | 162px / 17.8px | **162px** / 17.8px |
| C | 70px / 7.9px | 73px / 8.2px | 162px / 17.8px | **109px** / 12.1px |
| C1 / C2 / C3 | 70px / 7.9px | 73px / 8.2px | 162px / 17.8px | 109px / 12.1px |

The list costs the card no size: C1, C2 and C3 measure identically to plain C at every viewport, so
the choice between them is about reach and attention, not legibility.

(cell width / computed font size.) **Zero cells overflowed, at any viewport, in any variant, at the
cap** — and no page scrolled horizontally.

### What the list changes beyond layout — for #16, and worth recording

Two consequences that are decisions rather than observations:

1. **`description` becomes load-bearing.** Today it is a long-press nicety; in this list it is the
   thing that settles arguments about whether an event counted. That is a real addition to #16's
   brief for ~180 squares — every square needs prose that *disambiguates*, not prose that reminds.
2. **64 characters may not be enough for it.** The committed pool's descriptions run 31-64
   characters, median 47. Several mock descriptions here are deliberately longer (up to ~130),
   because "clarifies exactly what people are looking for" is a harder brief than "reminds you what
   the label meant" — compare `Safety car or virtual safety car deployed on or before lap 10.` (62)
   against `A track limits breach is announced as under investigation. A deleted lap on its own is
   not enough.` (98). If the chosen variant reads well at 130, that is licence for #16 to write the
   longer form; if it does not, the cap on `description` is the thing to set, and it has never had
   one. **Nothing on the card is affected either way** — this is the second field.

### Three findings that are worth more than the layouts

1. **#47 is fixable by construction, and the prototype demonstrates it.** The real `card-grid.tsx`
   sizes type with `clamp(0.5rem, 1.7vw, 0.8rem)` — a *viewport* function — while `max-w-md` pins
   the cell at ~77px from 448px up. Font outruns cell, so an iPad cell fits **fewer** characters per
   line than a phone cell (~10 vs ~13). `proto-card.tsx` instead makes the card a container-query
   container and sizes type in `cqw`, a fraction of the card's own width. Since a cell is always a
   fifth of the card, characters-per-line then holds constant at every viewport, and the iPad's
   162px cell carries 17.8px type rather than 12.8px. **This is the finding to fold into #13
   regardless of which layout wins.**
   - Watch for the trap: `cqw` inside the element that *is* the container resolves against the next
     container up, and with none it silently falls back to the viewport — i.e. straight back to the
     bug. The container must be an ancestor.
2. **Hyphenation buys nothing.** Measured with `hyphens: auto` on and off; overflow was zero either
   way. It only trades legibility for fit, and "Red Bull fum-bles a stop" is not a glanceable label
   with a race on. Not in the prototype, and it should not be the answer in #13 either.
3. **B cannot keep the "toast covers no part of the card" contract at landscape**, and this is
   inherent rather than a bug: the card fills the whole viewport, so any bottom-pinned row lands on
   it, and the pill sits on a cell too. C is the only variant where the undo row is docked in flow
   and provably covers nothing at every viewport.

### What is deliberately left ugly

Variant A at `phone` leaves ~340px of dead space under the card. The card is square and a phone is
not, so "full-bleed card" spends ~390 of 844 and the rest is empty however it is dressed. That is
the honest cost of D14 as written, so it is on screen rather than hidden.

## What still cannot be answered here

Everything the issue actually asks for. The numbers above prove nothing **clips**; they say nothing
about whether 8px type at 73px is *readable* on a phone at arm's length with a race on, which is a
question about eyes and a moving car and not about pixels. That is the hardware pass.

Also unbuilt, and a decision for whoever picks this up: `SURFACES.md` says #12 owns adding Playwright
as a repo devDependency and a real gate. This prototype drove Playwright from a scratch directory
instead, because a throwaway route is the wrong thing to hang the repo's permanent visual gate off.
The gate belongs with #13/#14, which will have a real screen to point it at. Raised on #12 rather
than silently skipped.

## Verdict

**C1 is settled**, for both form factors, and its two layouts differ on purpose:

- **Phone / portrait iPad** — Card | Race tabs; the list is one collapsible block under the card,
  shut by default.
- **Landscape iPad** — the card alone on the left; the right column tabbed **Looking for** / **Race**,
  opening on *Looking for*.

**`description` gets the longer form.** Licence granted for disambiguating prose well past the
committed pool's 64-character maximum. Evidenced at `stage=start` across all three viewports: 24 rows,
longest description **127 characters**, median 90, wrapping to two or three lines, **zero rows
overflowing** and no page scrolling horizontally. So the working cap is ~130 rather than 64, and
#16's brief becomes "say exactly what counts", not "remind the reader what the label meant".

*Correction to what was first reported on this: the round that granted the licence had only ever
shown descriptions up to 98 characters, because the 121-132 character ones sit on squares that the
mid-race mock had already marked and the list only carries open squares. `?stage=start` was added to
put them on screen, and they pass. The licence now rests on the 127 that was actually rendered.*

**Still open — the one thing that keeps #12 unclosed:**

- **Label cap.** Not judged on hardware yet. Nothing *clips* at 30 characters at any viewport once
  the `cqw` sizing lands (see finding 1), so the cap needs no tightening for layout reasons. Whether
  8px type in a 73px cell *reads* at arm's length with a car moving is the open question, and it is
  the last acceptance criterion on #12.

**Cleanup:** this folder stays until #13 and #14 have folded the decision in — it is the reference for
building the real screen. Deleting `apps/web/app/prototype/` is part of #14's done-ness.
