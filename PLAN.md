# Themed Multiplayer Bingo (F1 first)

## Context

Greenfield project in an empty directory. Build a simple online multiplayer bingo web app where
squares are *events*, not numbers — played on phones and 11" iPads while watching motorsport with
friends, and theme-able so F1 is the first theme rather than the only one. The square pool is
deliberately part hand-authored and part generated from templates.

It shares **infrastructure** with the existing `twinion` project (Vercel, Fly.io, Supabase,
Cloudflare) but deliberately **not** its codebase or deploy pipeline — see D2 for why.

**Target: the Dutch GP weekend.** F1 is in its summer break (Hungary, round 11, ran 26 July), and
round 12 is Zandvoort on 23 August — 26 clear days — which is a **sprint weekend**, giving a live
two-session shakedown:

```
now      28 Jul  ---- summer break, 26 days ----
        ~15 Aug  feature freeze, F1 pool authored
 Sat     22 Aug  SPRINT   <- dry run, ~30 min, low stakes
          night          fix whatever broke
 Sun     23 Aug  RACE     <- real target
 Sun     06 Sep  Monza    <- second outing; IndyCar theme, polish
```

> **Resolved — play is simultaneous, not necessarily live.** The design depends on simultaneity, not
> liveness. Everyone starting the same broadcast *or the same recording* at the same moment is
> functionally identical to live, so first-to-spot calling, SSE fanout and the shared timeline all
> work unchanged. The expectation that races often won't be watched live therefore costs nothing.
>
> Two consequences of the recording case: the host starting the game is the sync point (already how
> D13 works), and `+42:10` elapsed timeline stamps measure wall-clock since game start, so they will
> include any pause. Cosmetic, not worth correcting.
>
> **Async play is explicitly out of scope.** Players marking cards at different times over hours would
> invalidate D1, make the timeline meaningless, and render SSE over-built. If that is ever wanted it is
> a different design, not an increment on this one.

---

## The one idea everything else follows from

**Marks are derived, never stored.** A card is a fixed list of square IDs; a game owns an
append-only log of CALL/RETRACT rows; a player's marks are the intersection.

```
marks(player) = card.square_ids  ∩  {CALLs not superseded by a RETRACT}
```

This single choice gives, for free: no per-player mark rows, no sync conflicts, trivial reconnect,
correct late-joiner state, and cheap corrections. It **requires** stable deterministic square IDs
(`f1.v1:driver_retires:VER`) so the same event on two cards is the same thing.

---

## Decisions

| # | Decision |
|---|----------|
| **D1** | **Marking: first-to-spot calls it for everyone.** Tap a square on your own card → it marks for *every* player holding it, with a toast crediting you. No host burden, one shared truth, spotting is rewarded. The call log doubles as a race timeline. |
| **D2** | **New Fly app, Hono + SSE, own repo.** Not an extension of `twinion-api`. |
| **D3** | **Existing Supabase project, new `bingo` schema**, own Drizzle config and migration chain. |
| **D4** | **5×5 with a free centre** (24 earnable). `label` ≤30 chars on the card, `description` on long-press. Free centre is theme-flavoured ("LIGHTS OUT"). |
| **D5** | **Win ladder: one line → two lines → full house**, plus final standings by raw mark count. Co-winners allowed on simultaneous completion. |
| **D6** | **Room deck of ~40, tier-composed**, cards dealt from the deck (not the full pool). |
| **D7** | **Call scope: card-only for players, unrestricted for the host.** |
| **D8** | **Corrections: graduated friction, append-only.** |
| **D9** | **Generation happens at build time**, output committed and reviewed. |
| **D10** | **Themes are repo folders.** Theme #1 F1, **theme #2 IndyCar**. No editor, no DB-backed themes. |
| **D11** | **Identity: display name + server-issued token in localStorage.** Per-browser. No accounts. |
| **D12** | **Next.js 16 / React 19 / Tailwind v4, manifest + icons, no service worker.** |
| **D13** | **Room ≠ game.** Room = persistent group (code, theme, roster). Game = one session (deck, cards, log, winners). Same code for Saturday's sprint and Sunday's race, all season. |
| **D14** | **Two layouts in v1: phone and 11" iPad.** Prototype-gated. |
| **D15** | **Clean cards may re-roll immediately and without a limit.** A re-roll replaces the card, appends a `CARD_REROLLED` event, and resets its claim boundary. |

### D2 — why a separate service

Four properties of the existing service make it the wrong host, all verified in that repo:

- **Its deploy is a deliberately gated ritual** — a full local verification sweep before a manually
  triggered release. Correct for a website; far too heavy for bingo tweaks between practice and quali.
- **One migration chain** shared across the whole service. A bingo migration fault would abort the
  website API's release, and vice versa on race day.
- **Its concurrency limits are tuned for request/response traffic**, not for a room full of devices
  each holding an SSE stream open for two hours.
- **It imposes an API-owned response contract** with golden-corpus drift-assertion across several
  clients. A game would inherit that regime or need a documented carve-out.

**SSE, not WebSockets.** The only realtime need is server→client fanout; player actions are plain
POSTs. SSE's built-in `Last-Event-ID` reconnect maps exactly onto the append-only log — a device that
sleeps for 20 minutes reconnects and replays precisely the rows it missed, with no heartbeat protocol
or resync logic hand-rolled.

**Fly autostop caveat.** Fly's docs say only that the proxy uses `soft_limit` to judge excess capacity
and stops machines "when the app is idle for several minutes" — they say *nothing* about streaming, and
explicitly offer a self-managed-shutdown escape hatch for apps that "know about active streams the
proxy may not account for." So assume mid-race stops are possible. They are harmless here: state is in
Postgres and `Last-Event-ID` replay turns a stop into a ~2–5 s gap. Keep `auto_stop_machines = "stop"`
and `min_machines_running = 0` — do **not** set `"off"`.

Required `fly.toml`: `[http_service.concurrency] type = "connections", soft_limit = 200, hard_limit = 250`;
`http_options.idle_timeout = 600`; SSE `:ping` heartbeat every ~25 s.

### D3 — Drizzle multi-project hazard (must not be skipped)

Per Drizzle's config docs, `push`/`pull` manage **all** schemas by default, so a second project
pointed at one database sees the other's tables as absent and tries to remove them. Both mitigations
are required:

- bingo's `drizzle.config.ts` sets `schemaFilter: ['bingo']`, its own `out` dir, own migration chain.
- Add the matching one-line `schemaFilter` to the neighbouring project's Drizzle config as insurance.
  Its exposure is narrower today, but take it anyway.

The shared Supabase project already carries keep-alive tooling against the free tier's inactivity
pause. A second project would consume limited free-tier quota *and* need its own keep-alive, for no
benefit over a separate schema.

### D4 — card shape across two form factors

The `label` cap of ≤30 chars is set by the **phone**, since one pool serves both devices. At 390pt
portrait a 5×5 cell is ~68pt — about 5 characters per line. On an 11" iPad (834×1194pt) the same grid
gives ~160pt cells, so text breathes and `description` can render inline rather than on long-press.

### D6 — composition and pacing

```
theme pool (~180)  ->  room deck (40)  ->  cards (24 + free)
                         13 certain        ~8 certain
                         20 medium         ~12 medium
                          7 rare           ~4 rare

overlap: 24/40 = 60%  ->  each square sits on ~3.6 of 6 cards
expected marks: 8(.90) + 12(.50) + 4(.15) = 13.8   ✓ fits the win ladder
```

Dealing from a room-level deck is what makes the call mechanic work. Independent draws from a
180-square pool would put each square on ~1.8 of 6 cards, leaving many squares with a single possible
caller — and if that person is in the kitchen, the event is lost. Constraints: max 1 square per
exclusivity group per card (no card gets both "VER retires" and "VER DNF"); max ~2–3 per template per
deck so the deck feels varied.

Pacing is governed by the **rarity mix of a card**, not pool size — expected marks is just the sum of
per-square occurrence probabilities. Pool size only controls variety across a season.

> **Resolved — the F1 pool shipped at 300, not ~180, and the mix is accepted as it stands.**
> #16's authoring landed as #57–#60: 300 squares at `poolVersion: v2`, 230 generated from 11 teams /
> 22 drivers / 14 templates plus 70 hand-crafted, in a 40 certain / 191 medium / 69 rare mix. That is
> not the ≈60/90/30 the grilled plan (#53, decision 6) targeted, and it does not need to be.
> Retiering to hit the old split was considered and declined: no deck quota strains against the mix
> as it stands, and the ~2–3-per-template cap holds the generated side to 42 selectable squares
> however large the pool grows. Pool size buys season variety, which is what the paragraph above
> already says it buys.
>
> **The quotas now bind the card as well as the deck.** The 13/20/7 above is met across the 40, but
> the deal was taking 24 of those 40 with no tier control, so the deck's mix never reached the card
> drawn from it: over 3000 cards, 11.5% held 6–7 rare of 24, worst case 7 rare against 3 certain — a
> card that is mostly waiting. A dealt card therefore holds **at most 5 rare and at least 6 certain**.
> Bounds, not a second quota: the deal is still a draw, and these only rule out the tails the ~8/~12/~4
> above was always assumed to sit inside.

### D7 — call scope, and why

A mark is monotonically good for you, so under card-only calling you always call immediately —
incentives align perfectly. Opening calling to the whole deck creates a **denial incentive**: stay
quiet about the caution you don't hold, because calling it only helps opponents.

The **room creator can call any square in the deck**, via a separate deck sheet that is visibly an
admin surface rather than their card. This repairs misses without giving competitors a reason to
withhold. Residual risk is self-limiting: a square on one card, missed, harms only the player who
wasn't watching — which is the attention reward the model is built on.

### D8 — corrections

| Actor | Window | Interaction |
|---|---|---|
| Caller | ≤10 s | Undo toast, one tap, no confirm (no modals during a restart) |
| Caller | >10 s | Tap own marked square → confirmation dialog → retract |
| Host | anytime | Retract **any** call, own or others' |

Players retract only their own calls. Every correction is an **appended RETRACT row, never a delete** —
deleting would break `Last-Event-ID` replay.

### D9 — build-time generation

Generation is an **authoring-time concern**, which keeps it entirely off the race-day critical path.

```
themes/f1/
  entities.json     22 drivers, 11 teams, tiers, team pairings
  templates.json    {driver} retires, {team} botches a stop
  handcrafted.json  "Crofty: lights out and away we go"
  overrides.json    prune list + reworded lines
      |  pnpm pool:build
      v
  pool.generated.json   <- COMMITTED and reviewed, 300 squares at v2
```

Templates carry **per-entity tier rules**, because one template × 22 drivers yields 22 squares with
wildly different real-world odds — "Norris wins" is a coin-flip, "Bortoleto wins" is absurd:

```
"{driver} wins"   podium -> medium
                  points -> rare
                  field  -> excluded
```

The deck draw applies a **source quota** — ~24 hand-crafted + ~16 generated per 40-square deck — so the
hand-written character is guaranteed rather than accidental. Reviewing the committed artifact is where
awkward generated lines get pruned or reworded, which is the quality control generated text needs.

2026 F1 entity data to encode: 11 teams, 22 drivers, Norris carrying #1, Cadillac the new entrant,
Audi having taken over Sauber. Hardcoded — no live F1 API dependency to fail on race day.

`pool.generated.json` is also the natural theme *import* format if themes ever become user-supplied.

### D10 — themes: F1, then IndyCar

Theme #2 is **IndyCar**, targeted after Zandvoort (Monza timeframe or later). It needs its own
`entities.json` (2026 grid — roughly 27 full-season cars, 33 at the Indy 500 — which requires research)
and its own vocabulary: *caution* not safety car, *push-to-pass* not DRS, ovals and street circuits
rather than road courses, plus Indy-500-specific squares.

**Copy templates per theme rather than building an inheritance mechanism.** IndyCar shares most
structure with F1 ({driver} retires, {team} botches a stop), so a shared "motorsport" template set is
tempting — but ~15 duplicated template definitions are far cheaper than a speculative abstraction, and
duplication lets the vocabulary diverge naturally. Extract a shared set only if a third motorsport
theme appears.

**Honest caveat:** two open-wheel racing themes will *not* prove the theme boundary generalises beyond
motorsport. That's an acceptable v1 position, but the abstraction shouldn't be claimed as general until
something structurally different (a non-racing theme) has been through it.

### D13 — lifecycle details

Late joiners get a card from the same deck and it arrives correctly marked (free from the model).
Win detection fires only on calls at or after the player's current claim boundary: `join_seq` until
the first re-roll, then the latest `CARD_REROLLED` sequence. A line already complete at either
boundary renders greyed and unclaimable.

### D15 — clean-card re-rolls

A player may re-roll immediately and repeatedly while their current card has no live marks. Each
accepted re-roll replaces all 24 memberships from the same game deck, appends `CARD_REROLLED`, and
sets the card's claim boundary to that event's room sequence. Earlier live calls remain marks and
count in standings, but become inherited and cannot contribute to a prize; calls after the re-roll
remain earned and prize-eligible. The operation is serialized with calls by the game-row lock.

Timeline entries use **elapsed game time** (`+42:10`), not lap numbers — there is no live timing feed
and hand-entered laps aren't worth the friction.

### D14 — two layouts, both prototype-gated

**Phone** — full-bleed card, slim top bar (your marks · next unclaimed prize · `4/6 ●` presence),
swipe-up sheet for standings and timeline, calls as transient toasts over the card.

**11" iPad (834×1194 portrait / 1194×834 landscape)** — the sheet is a phone compromise, and an iPad
has no need of it. Landscape affords a genuine two-pane layout: card on the left, standings and live
timeline permanently visible on the right. An iPad propped next to the TV is plausibly the *primary*
device, so this is a first-class layout in v1, not a stretched phone view.

**Both are starting points, not commitments.** Before building the real room screen, run `/prototype`
to produce several toggleable variations and judge them **on real hardware in both form factors** —
the 68pt-cell legibility question cannot be settled in a resized desktop browser.

---

## Data model (`bingo` schema)

```
rooms        code(4) PK, theme_id, host_player_id, created_at
players      id PK, room_code, name, token(opaque), join_seq, last_seen_at
games        id PK, room_code, theme_id, deck(square_id[]), seed,
             state(lobby|live|done), started_at, ended_at
cards        game_id, player_id, square_ids[24], latest_reroll_seq BIGINT NULL, PK(game_id, player_id)
room_events  seq BIGSERIAL PK, room_code, game_id NULL, actor_player_id, at,
             kind(PLAYER_JOINED|GAME_STARTED|CALL|RETRACT|PRIZE|CARD_REROLLED),
             square_id NULL, target_seq NULL, prize_kind NULL
             UNIQUE(game_id, square_id) WHERE kind='CALL'   -- dedupe simultaneous calls
```

**The log is room-scoped, not game-scoped.** A single `seq` therefore orders roster changes *and*
game events, so there is one SSE stream, one `Last-Event-ID` replay path and one reconnect story
rather than two. `room_events.seq` is the SSE event id, making resume a single indexed query.
Prizes are recorded as events too, so no separate `prizes` table is needed — standings are read
from the log.

Cards store `square_ids` and only the claim-boundary metadata needed by re-rolls — marks are
computed, never written.

Endpoints:

```
POST /rooms                       create room + host player
POST /rooms/:code/join            create player, issue token, stamp join_seq
POST /rooms/:code/games           host: draw deck, deal cards, go live
GET  /rooms/:code/stream          SSE; honours Last-Event-ID; :ping every 25s
POST /games/:id/call              body {square_id}; verifies square ∈ caller's card (or caller is host)
POST /games/:id/retract           body {seq}; own call, or any call if host
POST /games/:id/card/reroll       no body; replaces the caller's clean card
```

Room codes are 4 characters from a 24-letter alphabet with `O/0/I/1` removed (~331k combinations,
readable aloud, thumb-typeable). The share link `…/r/ABCD` is the primary join path, with code entry
as the fallback.

---

## Build sequence

| Dates | Work |
|---|---|
| 28–31 Jul | Repo skeleton; Fly app + `fly.toml` per D2; Supabase `bingo` schema + Drizzle with `schemaFilter`; rooms/join/game endpoints; SSE stream with replay. Prove plumbing with two browsers. |
| 28 Jul–2 Aug | **`/prototype` the room screen, phone *and* 11" iPad** — several variations, mock state, judged on real hardware. Parallel; needs only mock data. |
| 1–8 Aug | F1 content: `entities.json`, `templates.json`, `handcrafted.json`, `pool:build`; review and prune. The long pole — authoring good squares takes longer than the code. Landed 29 Jul at 300 squares (v2). |
| 5–12 Aug | Real room screen from the chosen prototypes: card grid, calls, toasts, undo, phone sheet, iPad two-pane, standings, timeline. |
| 12–15 Aug | Host deck sheet; win ladder and prize moments; confetti; Screen Wake Lock; manifest + icons; OG unfurl for `/r/:code`. |
| **15 Aug** | **Feature freeze.** |
| 15–21 Aug | Replay-simulator testing, multi-device testing, real-hardware legibility pass on phone + iPad, deploy to production. |
| 22 Aug | **Sprint dry run** with real friends. Fix that night. |
| 23 Aug | **Race.** |
| Sep+ | IndyCar theme (entity research, vocabulary, pool authoring). |

Add the neighbouring project's one-line `schemaFilter` insurance as a separate small PR in that repo.

---

## Verification

**Replay simulator** (the key test — you cannot rehearse a 2-hour race in real time). A script that
POSTs a scripted call sequence at compressed intervals — a 2-hour race in ~3 minutes — against a real
room with 4–6 headless players. Asserts derived marks, the win ladder firing in order, standings, and
timeline output.

Then, specifically:

- **SSE resume**: mid-replay, airplane-mode a real device for 2 minutes. On reconnect, confirm
  `Last-Event-ID` replays exactly the missed rows and the card converges to the same state as a client
  that never dropped.
- **Fly autostop**: leave a room idle 15+ minutes, confirm the machine stops, then confirm a call
  restarts it with zero state loss and an acceptable cold-start gap.
- **Concurrency**: 20 simultaneous SSE connections, confirm the raised `soft_limit` behaves and no
  connection is dropped.
- **Dedupe**: two clients call the same square in the same tick → exactly one CALL row (the game-row
  lock does the work — ADR-0004). Then retract it and have both call it again: exactly one *new* row.
- **Late join**: join at `seq > 0`; confirm inherited marks appear, and that a pre-complete line is
  greyed and wins nothing.
- **Card re-roll**: re-roll a clean card repeatedly; confirm earlier live calls become inherited,
  stay in standings, and cannot win a prize, while later calls remain earned and eligible.
- **Corrections**: self-undo inside 10 s with no dialog; after 10 s with a dialog; host retraction of
  another player's call; all three produce RETRACT rows and every client converges.
- **Drizzle isolation** (safety-critical): run bingo's `drizzle-kit generate` against the shared
  database and read the emitted SQL — confirm it references only the `bingo` schema and contains no
  `DROP` touching twinion's `public` tables.
- **Real-hardware legibility**: render the 5×5 grid with the *longest* labels in the pool on the
  smallest target phone **and** on an 11" iPad in both orientations. If the phone fails, the fix is
  shorter labels, not a smaller font.

---

## Follow-ups (not in scope for 23 Aug)

- A non-racing theme, to test whether the theme boundary is real rather than aspirational.
- Paste-import of a `pool.generated.json` at room creation (cheap; the format already exists).
- Live context for generated squares (actual pole sitter, standings) — requires runtime expansion.
