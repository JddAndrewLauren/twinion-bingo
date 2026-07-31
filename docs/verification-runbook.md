# Verification runbook

The key test, because you cannot rehearse a two-hour race in real time (#18).

Most of PLAN.md's verification list is automated: `pnpm sim` plays a scripted race against a real
room over real HTTP and fails loudly on any divergence. Two items cannot be — one needs a phone in
a pocket and one needs the production Fly app that #19 creates. They are written out here, with the
place to record what they measured.

## The replay simulator

```bash
pnpm db:workspace          # this workspace's own database (never the shared project)
pnpm dev                   # in one terminal
pnpm sim                   # in another
```

About 70 seconds of wall clock, and every one of them a real HTTP round trip. Exit 0 is a pass;
exit 1 prints the failing checks with diffs, the room code and game id, and the whole log as the
sim received it, and leaves every row in the database for you to go and look at.

| Flag | Default | What it is for |
| --- | --- | --- |
| `--base-url URL` | `http://localhost:$((CONDUCTOR_PORT+1))` | Point it at Fly, or at a preview |
| `--players N` | 5 | 4–12; the host is player 0 |
| `--tick-ms N` | 1500 | Spacing between steps. Below ~1300 the settle hold-back and the 1 s stream poll make the room *look* laggy rather than broken — see `SETTLE_MS` in `src/rooms/events.ts` |
| `--sweep` | off | Hold 20 anonymous spectator streams for the whole replay, and assert every one of them got the complete log. Every stream is awaited to its SSE response before the game starts, so a connection that arrived late cannot pass on the backlog it replayed |
| `--timeout-ms N` | 360000 | Overall deadline; a hung stream fails the run rather than waiting out the race. A start delay is added on top of it rather than spent out of it |
| `--start-delay-ms N` | 0 | Hold joining open for N ms after the room exists and before the game starts, so real devices can be in the room the script plays against |
| `--park` | off | Play every phase that cannot close the game, then stop and leave the game live, printing a ready-to-run call for that room. A setup mode for the two procedures below, not a verification run — see below for what it does and does not assert |

What it covers, against the acceptance criteria on #18:

- a scripted race, 4–6 headless players, compressed to a couple of minutes;
- derived marks, three ways round — the server's `GameView`, an independent reducer over the rows
  the devices actually received, and the sim's own ledger of what it did;
- the win ladder in order, each rung judged against whoever qualified on the log as it stood below
  that rung's own row;
- standings and timeline, 1:1 with the live calls and newest call first;
- SSE resume: a device is dropped mid-replay and reconnects with `Last-Event-ID`, and every row
  appended while it was away has to be in its buffer, once, in order;
- duplicate calls: two devices, one square, one tick, exactly one CALL row (twice — a plain
  duplicate, and the re-call race a retraction opens up);
- corrections as far as the server sees them: three RETRACT rows, each naming the CALL it
  supersedes, two of them a player taking back their own call and one the host taking back somebody
  else's, and one of the two landing long after the log moved past the call it names;
- the full house closing the game, and a call after it refused with 409;
- with `--sweep`, 20 simultaneous streams, established before the game starts, none dropped, all
  with identical logs.

What it deliberately does **not** cover is D8's graduated friction — the one-tap undo inside ten
seconds versus the confirmation dialog after it. That is a client behaviour, and a retraction
arriving over HTTP looks identical whichever of the two sent it, so no amount of scripting here
could tell them apart. It is gated where it exists, in `apps/web/test/game-screen.test.tsx`
(`taking a call back`): the one-tap case with no dialog, the dialog once the window closes, the
host taking back another player's call, and the same correction reached from the deck sheet. Run it
with `pnpm --filter @twinion-bingo/web test`. Between the two suites all three correction paths are
covered end to end — the friction in the browser, the rule and the row on the server.

It is operator-run and deliberately not in CI: it needs a running server, a Postgres and real
minutes, and its job is deployment verification rather than regression coverage. The two pure
modules under it — `src/sim/scenario.ts` and `src/sim/reduce.ts` — have ordinary vitest coverage in
`test/sim-scenario.test.ts` that runs in `pnpm test` with no database.

To satisfy yourself it can fail: break one expectation in `src/sim/reduce.ts` (dropping the
`!superseded.has(...)` clause is a good one), run it, and confirm the marks and full-house checks
fail with printed diffs and the process exits 1. Put it back afterwards.

## Real-device SSE resume

*Not automatable: the sim's dropped device closes a socket, and a phone in a tunnel does not.*

The phones have to be in **the room the traffic is in**, and the sim always makes its own room — so
the sim goes first and the phones join the room it prints. `--park` is what makes that work: it
plays every phase that cannot close the game and stops with the game still live, so the room is
still there to compare afterwards.

```bash
pnpm db:workspace
pnpm dev                                            # on a machine two phones can reach
pnpm sim --park --tick-ms 6000 --start-delay-ms 60000
```

1. The sim prints `room ABCD` and then holds joining open for a minute. Open that room on both
   phones and join with a name on each, before the minute is out — a device that joins after the
   game starts is a late joiner, which is a fine thing to be but not what this measures.
2. The game starts and the script plays its 33 pre-march steps — at 6 s a step, about three and a
   quarter minutes of calls. Watch both phones mark up.
3. Once the calls are flowing, put phone A into airplane mode for two full minutes. Leave phone B
   alone. The two minutes fit inside the traffic with a minute to spare, and the room stays live
   after the sim exits, so there is no rush at the end.
4. Bring phone A back.

Pass: within a few seconds phone A's card, standings and timeline are identical to phone B's, and
its timeline holds the calls made while it was away — not a gap, and not a duplicate. Two minutes
matters: it is longer than the 25 s `:ping`, so the connection is genuinely gone rather than idle.

The check table a parked run prints is about the setup only — that every call and retraction the
script made was accepted, that every stream was connected before the game started, and that a
contested square appended one row. It asserts nothing derived, on purpose: the room holds cards
this run does not have the tokens for, so its standings and its ladder are not the sim's to check.
The verdict on this procedure is the two phones, read side by side.

Leave the calling to the script. A tap on a phone is a row the sim did not make, and while a parked
run asserts nothing that would trip over it, it muddies the one thing this procedure is reading: a
difference between the two phones at the end has to be attributable to the stint and to nothing
else.

## Fly autostop

*Blocked until #19 deploys the production app. Do not close #18's autostop box before then.*

`fly.toml` keeps `auto_stop_machines = "stop"` and `min_machines_running = 0` on the argument that a
mid-race stop costs a `Last-Event-ID` replay and a few seconds (PLAN.md, D2). That argument is a
prediction until it is measured, and this is the measurement that decides whether the position
stays.

The thing being timed is **a call into a live game**, not a health check: `/health` touches no room
and would measure the machine booting rather than a race resuming, and a game played through to its
full house answers 409 to every call after it. So the setup has to leave a live game behind and keep
the token, the game id and an uncalled square that player holds — which is what `--park` prints.

```bash
# 1. Make a room and leave the game live. Prints the room, the game, and the call to make later.
pnpm sim --base-url https://twinion-bingo-api.fly.dev --park --tick-ms 2000

# 2. Leave it alone for 15+ minutes — the parked run has exited and is holding no stream open —
#    then confirm the machine actually stopped.
fly machine list -a twinion-bingo-api

# 3. Time the call the parked run printed — the real thing, authenticated, into the live game.
curl -s -o /dev/null -w 'cold start: %{time_total}s\n' \
  -X POST https://twinion-bingo-api.fly.dev/games/<GAME_ID>/call \
  -H 'authorization: Bearer <TOKEN>' \
  -H 'content-type: application/json' \
  -d '{"square_id":"<SQUARE_ID>"}'

# 4. Read the game back — every square that was marked before the stop, plus the one just called.
curl -s https://twinion-bingo-api.fly.dev/rooms/<CODE>/game -H 'authorization: Bearer <TOKEN>'
```

Copy the two `curl` blocks out of the parked run's output rather than filling in the placeholders by
hand; it prints both with the ids already in them. The parked run takes about 70 s at `--tick-ms
2000` and calls 30-odd squares, so step 4 has something substantial to be identical to.

Convergence is the second half of the measurement and not a footnote: the call in step 3 must answer
201, step 4 must show every mark the room had before the machine stopped, and re-opening the room on
a device must come back to exactly that card. The state is in Postgres, so anything less is a bug
and not a cold start.

Record the number on the issue:

```bash
gh issue comment 18 --body "Fly autostop, measured $(date +%F):
- machines stopped after N minutes idle: yes/no
- cold-start gap on the first call back: X.Xs
- state after restart: identical / diverged (detail)
- verdict: autostop stays / autostop off"
```

A gap under about five seconds keeps the position. Much beyond that and the room feels broken at
exactly the moment somebody spotted something, and `min_machines_running = 1` is the trade to make.

## Re-running the sweep against Fly

Once #19 is live, the same tool is the deployment check — no second script, no second set of
assertions:

```bash
pnpm sim --base-url https://twinion-bingo-api.fly.dev --sweep
```

The 20 spectator streams are the `soft_limit = 200` check with the proxy in the path, which is the
only place it means anything.
