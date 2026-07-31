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
| `--sweep` | off | Hold 20 anonymous spectator streams for the whole replay, and assert every one of them got the complete log |
| `--timeout-ms N` | 360000 | Overall deadline; a hung stream fails the run rather than waiting out the race |

What it covers, against the acceptance criteria on #18:

- a scripted race, 4–6 headless players, compressed to a couple of minutes;
- derived marks, three ways round — the server's `GameView`, an independent reducer over the rows
  the devices actually received, and the sim's own ledger of what it did;
- the win ladder in order, each rung judged against whoever qualified on the log as it stood below
  that rung's own row;
- standings and timeline, 1:1 with the live calls;
- SSE resume: a device is dropped mid-replay and reconnects with `Last-Event-ID`, and every row
  appended while it was away has to be in its buffer, once, in order;
- duplicate calls: two devices, one square, one tick, exactly one CALL row (twice — a plain
  duplicate, and the re-call race a retraction opens up);
- all three correction paths (the ten-second toast, the dialog after it, the host's unrestricted
  retract), each producing a RETRACT row naming the right call;
- the full house closing the game, and a call after it refused with 409;
- with `--sweep`, 20 simultaneous streams, none dropped, all with identical logs.

It is operator-run and deliberately not in CI: it needs a running server, a Postgres and real
minutes, and its job is deployment verification rather than regression coverage. The two pure
modules under it — `src/sim/scenario.ts` and `src/sim/reduce.ts` — have ordinary vitest coverage in
`test/sim-scenario.test.ts` that runs in `pnpm test` with no database.

To satisfy yourself it can fail: break one expectation in `src/sim/reduce.ts` (dropping the
`!superseded.has(...)` clause is a good one), run it, and confirm the marks and full-house checks
fail with printed diffs and the process exits 1. Put it back afterwards.

## Real-device SSE resume

*Not automatable: the sim's dropped device closes a socket, and a phone in a tunnel does not.*

1. Start `pnpm dev` on a machine two phones can reach, and open the room on both.
2. Start `pnpm sim --tick-ms 4000` against the same API so the room has traffic for a few minutes,
   or just play by hand.
3. Put phone A into airplane mode for two full minutes. Leave phone B alone.
4. Bring phone A back.

Pass: within a few seconds phone A's card, standings and timeline are identical to phone B's, and
its timeline holds the calls made while it was away — not a gap, and not a duplicate. Two minutes
matters: it is longer than the 25 s `:ping`, so the connection is genuinely gone rather than idle.

## Fly autostop

*Blocked until #19 deploys the production app. Do not close #18's autostop box before then.*

`fly.toml` keeps `auto_stop_machines = "stop"` and `min_machines_running = 0` on the argument that a
mid-race stop costs a `Last-Event-ID` replay and a few seconds (PLAN.md, D2). That argument is a
prediction until it is measured, and this is the measurement that decides whether the position
stays.

```bash
# 1. Make a room and a game against production, then leave it alone for 15+ minutes.
pnpm sim --base-url https://twinion-bingo-api.fly.dev --tick-ms 2000

# 2. Confirm the machine actually stopped.
fly machine list -a twinion-bingo-api

# 3. Time the first call back into the sleeping app.
curl -s -o /dev/null -w 'cold start: %{time_total}s\n' https://twinion-bingo-api.fly.dev/health
```

Then re-open the room from a device and confirm the card comes back exactly as it was — the state
is in Postgres, so anything less is a bug and not a cold start.

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
