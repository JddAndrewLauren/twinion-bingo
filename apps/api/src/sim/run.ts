import { isDeepStrictEqual } from 'node:util';

import { CARD_SQUARES } from '../games/deck.js';
import type { PrizeKind } from '../games/prizes.js';
import type { RoomEvent } from '../rooms/events.js';
import { EventStream, HeadlessPlayer, sleep } from './client.js';
import {
  before,
  ladderOrder,
  liveCalls,
  marksOf,
  rungsOf,
  standingsOf,
  timelineOf,
  winnersOf,
  type SimCard,
} from './reduce.js';
import { buildScenario, type Action, type SimHand } from './scenario.js';

/**
 * The replay simulator: a scripted two-hour race in about two minutes, over real
 * HTTP, against a real room of headless players.
 *
 *     pnpm sim [--base-url URL] [--players 5] [--tick-ms 1500] [--sweep]
 *              [--start-delay-ms 0] [--park]
 *
 * You cannot rehearse a race in real time, so this is the rehearsal. It plays
 * the script in `scenario.ts` against a running API, re-derives everything out
 * of the rows its devices actually received (`reduce.ts`), and compares that
 * against what the server says — three ways round: the server's answer, the
 * independent reducer's answer, and the sim's own ledger of what it did.
 *
 * It is a deployment check and not a regression test: it needs a real server,
 * a real Postgres and real minutes. The two pure modules under it have ordinary
 * vitest coverage that runs with neither. `--base-url` is what makes the same
 * tool the check against Fly once there is a Fly to check — see
 * `docs/verification-runbook.md`.
 *
 * On failure it prints the table, the diffs, and the room code and game id, and
 * leaves every row in the database for you to go and look at.
 *
 * Two flags exist only for the procedures in that runbook, which need a room a
 * human can be part of: `--start-delay-ms` holds joining open before the game
 * starts, and `--park` stops before the march so the room is left mid-race with a
 * live game rather than played out to its full house.
 */

type Options = {
  baseUrl: string;
  players: number;
  tickMs: number;
  sweep: boolean;
  timeoutMs: number;
  /** A pause after the room exists, for real devices to join it (runbook). */
  startDelayMs: number;
  /** Stop before the march, leaving a live game behind (runbook). */
  park: boolean;
};

/** The raised `soft_limit` the room has to hold (PLAN.md's verification list). */
const SPECTATORS = 20;

/** The dev script's port arithmetic, so a workspace's own API is the default. */
function defaultBaseUrl(): string {
  const conductorPort = Number(process.env.CONDUCTOR_PORT ?? 8079);
  const port = Number.isInteger(conductorPort) ? conductorPort + 1 : 8080;

  return `http://localhost:${port}`;
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    baseUrl: defaultBaseUrl(),
    players: 5,
    tickMs: 1500,
    sweep: false,
    timeoutMs: 360_000,
    startDelayMs: 0,
    park: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined) throw new Error(`${String(flag)} needs a value`);
      index += 1;

      return next;
    };

    switch (flag) {
      case '--base-url':
        options.baseUrl = value().replace(/\/+$/, '');
        break;
      case '--players':
        options.players = Number(value());
        break;
      case '--tick-ms':
        options.tickMs = Number(value());
        break;
      case '--timeout-ms':
        options.timeoutMs = Number(value());
        break;
      case '--start-delay-ms':
        options.startDelayMs = Number(value());
        break;
      case '--sweep':
        options.sweep = true;
        break;
      case '--park':
        options.park = true;
        break;
      default:
        throw new Error(`unknown flag ${String(flag)}`);
    }
  }

  if (!Number.isInteger(options.players) || options.players < 4 || options.players > 12) {
    throw new Error('--players must be a whole number between 4 and 12');
  }
  if (!Number.isInteger(options.tickMs) || options.tickMs < 100) {
    throw new Error('--tick-ms must be at least 100');
  }
  if (!Number.isInteger(options.startDelayMs) || options.startDelayMs < 0) {
    throw new Error('--start-delay-ms must be a whole number of milliseconds');
  }
  // The pause is time the run spends doing nothing, so it cannot come out of the
  // deadline that is there to catch a hung stream.
  options.timeoutMs += options.startDelayMs;

  return options;
}

type Check = { name: string; pass: boolean; expected?: unknown; actual?: unknown };

const checks: Check[] = [];

function check(name: string, expected: unknown, actual: unknown): void {
  checks.push({ name, pass: isDeepStrictEqual(expected, actual), expected, actual });
}

function checkThat(name: string, pass: boolean, detail?: unknown): void {
  checks.push({ name, pass, actual: pass ? undefined : detail });
}

/** What a failing run needs printed, filled in as the run learns it. */
type Run = { room?: string; gameId?: string; log: RoomEvent[] };

function report({ room, gameId, log }: Run): boolean {
  const width = Math.max(...checks.map((entry) => entry.name.length), 0);

  console.log('');
  for (const entry of checks) {
    console.log(`${entry.pass ? 'PASS' : 'FAIL'}  ${entry.name.padEnd(width)}`);
  }

  const failures = checks.filter((entry) => !entry.pass);
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`\n--- ${failure.name}`);
      if (failure.expected !== undefined) {
        console.log(`  expected: ${JSON.stringify(failure.expected)}`);
      }
      console.log(`  actual:   ${JSON.stringify(failure.actual)}`);
    }

    console.log(`\nroom ${String(room)}, game ${String(gameId)} — left in the database.`);
    console.log('the log as the sim received it:');
    for (const event of log) {
      console.log(
        `  ${String(event.seq).padStart(6)} ${event.kind.padEnd(14)} ` +
          `${event.squareId ?? event.prizeKind ?? ''} ${event.targetSeq === null ? '' : `->${event.targetSeq}`}`,
      );
    }
  }

  return failures.length === 0;
}

const options = parseOptions(process.argv.slice(2));

const run: Run = { log: [] };

/** A hung stream would otherwise wait for the heat death of the race. */
const timeout = setTimeout(() => {
  checkThat(`the replay finished inside ${options.timeoutMs}ms`, false);
  report(run);
  process.exit(1);
}, options.timeoutMs);

console.log(`sim: ${options.baseUrl}, ${options.players} players, ${options.tickMs}ms ticks` +
  `${options.sweep ? `, ${SPECTATORS} spectators` : ''}`);

// 1. A room, its host, and the rest of the grid.
const host = await HeadlessPlayer.host(options.baseUrl, 'Sim Host');
run.room = host.code;
const players = [host];
for (let index = 1; index < options.players; index += 1) {
  players.push(await HeadlessPlayer.join(options.baseUrl, host.code, `Sim ${index}`));
}
console.log(`room ${host.code}`);

// The room exists and the game does not, which is the only window a real device
// can join in and be in the game from lights out rather than as a late joiner.
// `--start-delay-ms` holds it open — the runbook's phones join here, so the
// traffic they watch is this room's.
if (options.startDelayMs > 0) {
  console.log(
    `joining is open for ${Math.round(options.startDelayMs / 1000)}s — ` +
      `open room ${host.code} on every device that is watching, then wait`,
  );
  await sleep(options.startDelayMs);
}

// 2. Every device holds its stream from before the game starts, which is how it
//    learns the game started at all.
const streams = players.map(
  (player, index) => new EventStream(options.baseUrl, host.code, `player ${index} (${player.label})`),
);
const spectators = options.sweep
  ? Array.from(
      { length: SPECTATORS },
      (_, index) => new EventStream(options.baseUrl, host.code, `spectator ${index}`),
    )
  : [];

// Awaited, not slept on: a spectator still inside its `fetch` when the game
// starts would replay the whole log on connect and be indistinguishable from one
// that held the connection throughout — which is how a sweep passes without ever
// having held the twenty connections it is there to prove.
for (const stream of [...streams, ...spectators]) stream.open();
await Promise.all([...streams, ...spectators].map((stream) => stream.ready()));

checkThat(
  'every stream was connected before the game started',
  [...streams, ...spectators].every((stream) => stream.failure === undefined),
  [...streams, ...spectators]
    .filter((stream) => stream.failure !== undefined)
    .map((stream) => ({ stream: stream.label, failure: String(stream.failure) })),
);

// 3. The deal, and the cards it produced — the script is built from those.
const started = await host.startGame();
run.gameId = started.id;
console.log(`game ${started.id}`);

const dealt = await Promise.all(players.map((player) => player.game()));
const hands: SimHand[] = players.map((player, index) => ({
  playerId: player.player.id,
  name: player.label,
  squareIds: dealt[index]?.card?.map((square) => square.id) ?? [],
}));
const cards: SimCard[] = players.map((player, index) => ({
  playerId: player.player.id,
  name: player.label,
  joinSeq: player.player.joinSeq,
  squareIds: hands[index]?.squareIds ?? [],
}));

checkThat(
  'every player was dealt a card',
  hands.every((hand) => hand.squareIds.length === CARD_SQUARES),
  hands.map((hand) => hand.squareIds.length),
);

const scenario = buildScenario(hands, { tickMs: options.tickMs });
console.log(
  `script: ${scenario.steps.length} steps, closer is player ${scenario.closer}, ` +
    `player ${scenario.dropped} goes offline`,
);

// 4. The replay. Everything in a step goes out together; steps are a tick apart.
const seqByTag = new Map<string, number>();
const appendedBySquare = new Map<string, number>();
const liveByLedger = new Map<string, number>();
const retractions: { seq: number; targetSeq: number; squareId: string }[] = [];

/**
 * The seam the resume has to close: the last row the device saw before it went
 * off the air, and the last row the room appended while it was away.
 *
 * The far end is measured from the sim's own writes rather than from another
 * device's stream, because a stream is behind the log by the settle hold-back
 * and a poll — measuring the stint against a lagging reader would understate it
 * and let the check pass on nothing.
 */
let resumedFrom = 0;
let resumedAt = 0;
let appendedHead = 0;

async function act(action: Action): Promise<void> {
  const player = players[action.player];
  const stream = streams[action.player];
  if (player === undefined || stream === undefined) return;

  switch (action.kind) {
    case 'call': {
      const { status, body } = await player.call(started.id, action.squareId);
      checkThat(
        `calling ${action.squareId} was accepted`,
        status === 201 || status === 200,
        { status, body },
      );
      if (status !== 201 && status !== 200) return;

      if (action.tag !== undefined) seqByTag.set(action.tag, body.seq);
      liveByLedger.set(action.squareId, body.seq);
      appendedHead = Math.max(appendedHead, body.seq);
      if (body.appended) {
        appendedBySquare.set(
          action.squareId,
          (appendedBySquare.get(action.squareId) ?? 0) + 1,
        );
      }

      return;
    }

    case 'retract': {
      const targetSeq = seqByTag.get(action.target);
      if (targetSeq === undefined) return;

      const { status, body } = await player.retract(started.id, targetSeq);
      checkThat(`retracting ${action.target} was accepted`, status === 201, { status, body });
      if (status !== 201) return;

      retractions.push({ seq: body.seq, targetSeq, squareId: body.squareId });
      appendedHead = Math.max(appendedHead, body.seq);
      liveByLedger.delete(body.squareId);

      return;
    }

    case 'drop': {
      stream.close();
      resumedFrom = stream.lastSeq;
      console.log(`  player ${action.player} off the air, last seeing seq ${stream.lastSeq}`);

      return;
    }

    case 'resume': {
      resumedAt = appendedHead;
      stream.open();
      await stream.ready();
      console.log(
        `  player ${action.player} back, resuming from ${resumedFrom}; ` +
          `the room reached ${appendedHead} while it was away`,
      );

      return;
    }

    case 'call-when-done': {
      const { status, body } = await player.call(started.id, action.squareId);
      check('a call into a finished game is refused with 409', 409, status);
      if (status !== 409) console.log(`  post-done call answered ${status}: ${JSON.stringify(body)}`);

      return;
    }
  }
}

const startedAt = Date.now();
let phase = '';

for (const step of scenario.steps) {
  // A parked run plays everything that cannot close the game and stops there:
  // the march exists to fill a card to the full house, and the full house is a
  // one-way door (D5, ADR-0003).
  if (options.park && (step.phase === 'march' || step.phase === 'post-done')) break;

  if (step.phase !== phase) {
    phase = step.phase;
    console.log(`[${phase}]`);
  }

  const calls = step.actions.filter((action) => action.kind === 'call');
  const appendedBefore = new Map(appendedBySquare);

  await Promise.all(step.actions.map((action) => act(action)));

  // Two devices, one square, one tick: exactly one of them created a row, and
  // the other was handed it (ADR-0004). Which one is not the sim's business.
  const contested = new Set(
    calls
      .map((action) => (action.kind === 'call' ? action.squareId : ''))
      .filter((squareId, index, all) => all.indexOf(squareId) !== index),
  );
  for (const squareId of contested) {
    const appended =
      (appendedBySquare.get(squareId) ?? 0) - (appendedBefore.get(squareId) ?? 0);
    check(`two devices calling ${squareId} in one tick appended one row`, 1, appended);
  }

  await sleep(options.tickMs);
}

console.log(`replay done in ${Math.round((Date.now() - startedAt) / 1000)}s`);

/**
 * `--park`: a room left mid-race on purpose, and the two runbook procedures a
 * finished game is no good for.
 *
 * The autostop measurement is an authenticated *call* waking a sleeping machine
 * while the game is still live — a done game answers 409 and would time the
 * wrong thing — so this hands over what one real call later needs: a player's
 * token, the game, and a square that player holds and nobody has called. And the
 * real-device resume needs a room two phones can sit in while it has traffic,
 * which is the same room and the same live game.
 *
 * Nothing derived is asserted here, and that is the point: the room is shared
 * with devices this run does not hold the cards of, so the standings and the
 * ladder are not the sim's to check. What it does report is whether the setup
 * itself worked — every call and retraction the script made, and one row per
 * contested square.
 */
if (options.park) {
  // A non-host, so the call that wakes the machine is scope-checked against a
  // card (D7) rather than waved through by the host's whole-deck exemption.
  const parked = players[1]!;
  const spare = (hands[1]?.squareIds ?? []).find(
    (squareId) => !liveByLedger.has(squareId),
  );

  clearTimeout(timeout);
  run.log = streams[0]?.events ?? [];
  const setUp = report(run);
  for (const stream of [...streams, ...spectators]) stream.close();

  console.log(`\nparked: room ${host.code}, game ${started.id} — still live.`);
  console.log(
    `${liveByLedger.size} squares called; ${String(spare)} is one nobody has, ` +
      `and it is on ${parked.label}'s card.`,
  );
  console.log('\nleave it alone, then time the call that wakes it:\n');
  console.log(
    `  curl -s -o /dev/null -w 'cold start: %{time_total}s\\n' \\\n` +
      `    -X POST ${options.baseUrl}/games/${started.id}/call \\\n` +
      `    -H 'authorization: Bearer ${parked.token}' \\\n` +
      `    -H 'content-type: application/json' \\\n` +
      `    -d '{"square_id":"${String(spare)}"}'\n`,
  );
  console.log('and read the game back to confirm nothing was lost:\n');
  console.log(
    `  curl -s ${options.baseUrl}/rooms/${host.code}/game \\\n` +
      `    -H 'authorization: Bearer ${parked.token}'\n`,
  );

  process.exit(setUp ? 0 : 1);
}

// 5. Let the hold-back and the poll catch up before asking anybody anything.
let head = -1;
for (;;) {
  const view = await host.game();
  if (view.streamedThroughSeq === head) break;
  head = view.streamedThroughSeq;
  await sleep(1_000);
}

const converged = await (async (): Promise<boolean> => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ([...streams, ...spectators].every((stream) => stream.lastSeq >= head)) return true;
    await sleep(200);
  }

  return false;
})();

checkThat(
  `every stream caught up to seq ${head}`,
  converged,
  [...streams, ...spectators].map((stream) => ({ stream: stream.label, at: stream.lastSeq })),
);

const views = await Promise.all(players.map((player) => player.game()));

// 6. What the log says, what the server says, and what the sim did.
const reference = streams[0]!;
const log = reference.events;
run.log = log;

const derivedCalls = liveCalls(log, started.id);

checkThat(
  'no stream dropped or died',
  [...streams, ...spectators].every((stream) => stream.failure === undefined),
  [...streams, ...spectators]
    .filter((stream) => stream.failure !== undefined)
    .map((stream) => ({ stream: stream.label, failure: String(stream.failure) })),
);

for (const stream of [...streams, ...spectators]) {
  const seqs = stream.events.map((event) => event.seq);
  const ascending = seqs.every((seq, index) => index === 0 || seq > seqs[index - 1]!);

  checkThat(`${stream.label} saw each row once, in order`, ascending, seqs);
}

for (const stream of [...streams, ...spectators].slice(1)) {
  check(`${stream.label} saw the same log as ${reference.label}`,
    reference.events.map((event) => event.seq),
    stream.events.map((event) => event.seq),
  );
}

// The resume, stated so it cannot pass vacuously: the stint has to have had
// rows in it, and every one of them has to be in the buffer of the device that
// was not there for them.
const resumed = streams[scenario.dropped]!;
const missed = reference.events
  .filter((event) => event.seq > resumedFrom && event.seq <= resumedAt)
  .map((event) => event.seq);

checkThat(
  'the offline stint had rows to miss',
  missed.length >= 5,
  { resumedFrom, resumedAt, missed: missed.length },
);
check(
  `${resumed.label} replayed every row of its stint from Last-Event-ID`,
  missed,
  resumed.events
    .map((event) => event.seq)
    .filter((seq) => seq > resumedFrom && seq <= resumedAt),
);

// Marks, three ways: the server's derivation, the reducer's, and the ledger's.
for (const [index, view] of views.entries()) {
  const card = cards[index]!;
  const server = view.marks.map((mark) => mark.squareId);

  check(`player ${index}'s marks match the reducer`, marksOf(card, derivedCalls), server);
  check(
    `player ${index}'s marks match the sim's ledger`,
    card.squareIds.filter((id) => liveByLedger.has(id)),
    server,
  );
  checkThat(
    `player ${index}'s marks name the CALL rows that made them`,
    view.marks.every((mark) =>
      derivedCalls.some((call) => call.seq === mark.seq && call.squareId === mark.squareId),
    ),
    view.marks,
  );
}

// The ladder, rung by rung, judged on the log as it stood when each rung fired.
const rungs = rungsOf(log, started.id);
check(
  'the ladder was climbed in order',
  ladderOrder.slice(0, rungs.length),
  rungs.map((rung) => rung.kind),
);

for (const rung of rungs) {
  check(
    `${rung.kind} went to whoever qualified on the log below seq ${rung.at}`,
    winnersOf(cards, liveCalls(before(log, rung.at), started.id), rung.kind as PrizeKind).sort(),
    [...rung.winners].sort(),
  );
}

check(
  "the server's prize list is the log's",
  rungs.flatMap((rung) => rung.winners.map((playerId) => ({ kind: rung.kind, playerId }))),
  views[0]!.prizes.map((prize) => ({ kind: prize.prizeKind, playerId: prize.playerId })),
);

// Standings and timeline, off the same rows.
check(
  'standings match the reducer',
  standingsOf(cards, derivedCalls),
  views[0]!.standings.map((standing) => ({
    playerId: standing.playerId,
    name: standing.name,
    marks: standing.marks,
  })),
);

const serverTimeline = views[0]!.timeline;
check(
  'the timeline is the live calls, 1:1 and credited',
  timelineOf(cards, derivedCalls),
  serverTimeline.map((entry) => ({
    seq: entry.seq,
    squareId: entry.squareId,
    playerId: entry.playerId,
    name: entry.name,
  })),
);
// Newest first (CONTEXT.md), so the stamps count *down* the list — a timeline
// whose elapsed column climbed as you read down it would be in log order.
checkThat(
  'the timeline reads as elapsed game time, newest row first',
  serverTimeline.every(
    (entry, index) =>
      /^\+\d{2,}:\d{2}$/.test(entry.elapsed) &&
      (index === 0 || entry.elapsed <= serverTimeline[index - 1]!.elapsed),
  ),
  serverTimeline.map((entry) => entry.elapsed),
);

// Dedupe, everywhere rather than only where the script contested a square: one
// CALL row per call the server told somebody it had appended.
const callRows = log.filter((event) => event.kind === 'CALL' && event.gameId === started.id);
const rowsBySquare = new Map<string, number>();
for (const row of callRows) {
  const squareId = row.squareId ?? '';
  rowsBySquare.set(squareId, (rowsBySquare.get(squareId) ?? 0) + 1);
}
check(
  'the log holds exactly one CALL row per appended call',
  [...appendedBySquare.entries()].sort(),
  [...rowsBySquare.entries()].sort(),
);

// Corrections, as far as HTTP can see them: the server's rule about who may take
// back what, and a RETRACT naming its CALL. D8's graduated friction — one tap
// inside ten seconds, a confirmation dialog after — is a client behaviour and is
// gated in `apps/web/test/game-screen.test.tsx`; a retraction over the wire looks
// identical whichever of the two sent it, so nothing here can tell them apart and
// nothing here claims to.
for (const retraction of retractions) {
  const row = log.find((event) => event.kind === 'RETRACT' && event.seq === retraction.seq);

  check(`RETRACT ${retraction.seq} names call ${retraction.targetSeq}`,
    retraction.targetSeq,
    row?.targetSeq,
  );
}
const retractRows = log.filter(
  (event) => event.kind === 'RETRACT' && event.gameId === started.id,
);
check('every retraction the sim made is a RETRACT row', 3, retractRows.length);

// Who was allowed to take back what: your own call, or anyone's if you host.
check(
  'two calls came back by their caller and one by the host',
  { byCaller: 2, byHost: 1 },
  retractRows.reduce(
    (tally, row) => {
      const called = log.find((event) => event.seq === row.targetSeq);
      const own = called?.actorPlayerId === row.actorPlayerId;

      return {
        byCaller: tally.byCaller + (own ? 1 : 0),
        byHost:
          tally.byHost +
          (!own && row.actorPlayerId === host.player.id ? 1 : 0),
      };
    },
    { byCaller: 0, byHost: 0 },
  ),
);
checkThat(
  'a retracted square nobody called again is marked nowhere',
  scenario.retired.every((squareId) =>
    views.every((view) => !view.marks.some((mark) => mark.squareId === squareId)),
  ),
  scenario.retired,
);

// The full house is a one-way door (D5, ADR-0003).
check('the game finished', 'done', views[0]!.state);

const passed = report(run);

clearTimeout(timeout);
for (const stream of [...streams, ...spectators]) stream.close();

process.exit(passed ? 0 : 1);
