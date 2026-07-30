import type { Page, Route } from '@playwright/test';

/**
 * The room the gate looks at, served by intercepting the API rather than running
 * one.
 *
 * This is a deliberate departure from how #8-#11 ran their gates, which drove a
 * real API against a real Postgres. Those runs were checking that marks *derive*
 * correctly; this one is checking that 24 labels fit in 24 cells and that nothing
 * covers the card. For that, a database is a dependency that stops the gate being
 * runnable — and a gate nobody can run is the thing `docs/SURFACES.md` exists to
 * prevent. `apps/web/test/` already pins the wiring against a stub of the same
 * shape, and `apps/api/` pins the derivation itself.
 *
 * What it costs, said out loud: this proves nothing about the API's contract. If a
 * field is renamed server-side, the fixture keeps the gate green while the app
 * breaks. The fixture is typed against `room-api.ts`, so a rename on *this* side is
 * caught by `tsc`, and the API's own tests cover the other.
 */
import type {
  CardSquare,
  Game,
  Mark,
  PrizeAward,
  Roster,
  TimelineEntry,
} from '../app/room-api';

const CODE = 'ABCD';
const GAME_ID = 'gate-game';

const HOST = { id: 'host-id', name: 'Ash', joinSeq: 1 };
const GUEST = { id: 'guest-id', name: 'Bea', joinSeq: 2 };

/**
 * A 24-character display name is the roster's cap, and the standings row is where a
 * long one shows: it has to truncate rather than push the mark count off the row.
 */
const LONG_NAME = { id: 'long-id', name: 'Wilhelmina Featherstone', joinSeq: 3 };

const ROSTER: Roster = {
  code: CODE,
  themeId: 'f1.v1',
  hostPlayerId: HOST.id,
  players: [HOST, GUEST, LONG_NAME, { id: 'd', name: 'Cal', joinSeq: 4 },
    { id: 'e', name: 'Dev', joinSeq: 5 }, { id: 'f', name: 'Eve', joinSeq: 6 }],
  you: HOST,
};

/**
 * The labels are the whole point of the card gate, so they are the worst case the
 * cap permits rather than a representative sample — #8's run recorded that a gate
 * over short labels proves nothing.
 *
 * Every label is exactly 30 characters, `LABEL_MAX_CHARS`, and the longest single
 * *word* in the set is 13. Word length rather than character count is what a cell
 * breaks on (#47), and 13 is the length of `investigation`, which #16 will author:
 * *championship* (12), *disqualified* (12) and *reprimanded* (11) are the same
 * ordinary motorsport vocabulary. The committed 47-square pool's longest word is
 * exactly 10, so gating on the pool as it stands today would gate on zero headroom.
 *
 * The descriptions are #12's licence in use: disambiguating prose rather than a
 * reminder, running past the committed pool's 64-character maximum to the ~130 the
 * prototype evidenced. Two of them are at that ceiling on purpose.
 */
const LABELS: readonly [string, string][] = [
  ['Track limits investigation', 'A track limits breach is announced as under investigation. A deleted lap on its own is not enough for this.'],
  ['Championship lead changes', 'The drivers championship lead changes hands on the road, on the timing screen, at any point in the race.'],
  ['Driver is disqualified', 'A driver is disqualified during or after the race, for any reason the stewards give.'],
  ['Team boss is reprimanded', 'A team principal is reprimanded on the radio or by the stewards.'],
  ['Safety car before lap ten', 'Safety car or virtual safety car deployed on or before lap 10.'],
  ['Investigation after race', 'The stewards announce an investigation that will be heard after the race has finished.'],
  ['Commentator says degradation', 'Either commentator says the word degradation, or degradedation, at least once.'],
  ['Championship rival contact', 'Two drivers in the top three of the championship make contact with each other.'],
  ['Pit lane start for someone', 'A driver starts the race from the pit lane rather than from their grid slot.'],
  ['Disqualified from qualifying', 'A qualifying result is thrown out and the driver starts from the back.'],
  ['Investigation into a pit stop', 'An unsafe release or a pit lane infringement is put under investigation.'],
  ['Rain arrives before half way', 'Visible rain on the broadcast, on the racing line, before the halfway lap.'],
  ['Reprimanded for track limits', 'A driver picks up a reprimand rather than a time penalty for track limits.'],
  ['Front wing change in a stop', 'A front wing is changed during a pit stop, whether or not it was damaged.'],
  ['Championship leader retires', 'The championship leader fails to finish the race under their own power.'],
  ['Five second time penalty', 'Any driver is given a five second time penalty during the race.'],
  ['Investigation goes nowhere', 'An announced investigation is closed with no further action taken.'],
  ['Team orders on the radio', 'A team asks one of its drivers to let the other one past.'],
  ['Disqualified for a technical', 'A car fails a technical check and its result is removed.'],
  ['Somebody hits the pit wall', 'Any car makes contact with the pit wall or the pit entry barrier.'],
  ['Reprimanded in the pit lane', 'A driver or a mechanic is reprimanded for something in the pit lane.'],
  ['Championship gap under ten', 'The gap at the top of the drivers championship falls below ten points.'],
  ['Investigation for weaving', 'A driver is investigated for moving under braking or for weaving.'],
  ['Virtual safety car returns', 'A second virtual safety car period after an earlier one has ended.'],
];

const DECK_EXTRA = Array.from({ length: 16 }, (_, index) => ({
  id: `f1.v1:gate:deck:${index}`,
  label: 'Investigation into a stop',
  description: 'A deck square that is on no card of the host, so only they can call it.',
  tier: 'medium',
}));

const CARD: CardSquare[] = LABELS.map(([label, description], index) => ({
  id: `f1.v1:gate:${index}`,
  label,
  description,
  tier: index < 8 ? 'certain' : index < 20 ? 'medium' : 'rare',
}));

/** Which of the card's squares the fixture serves as already marked. */
export type Stage =
  /** Lights out: nothing called, so the list carries all 24 rows — its worst case. */
  | 'start'
  /** Mid-race: half the card marked, some of it inherited, prizes on the board. */
  | 'mid'
  /** The full house has landed and the game is `done`. */
  | 'done';

export type Fixture = {
  /** Push a frame down the injected stream, as another phone's call would arrive. */
  emit: (event: {
    seq: number;
    kind: string;
    actorPlayerId?: string;
    squareId?: string;
    /** The rung a PRIZE row carries, which is what a burst is fired for. */
    prizeKind?: string;
  }) => Promise<void>;
  /** The card square at a grid index, for a test that wants to name what it tapped. */
  square: (index: number) => CardSquare;
  /**
   * How many streams this page has ever opened. The count, not the live ones: the
   * stub keeps every `EventSource` it was asked for, so "exactly one" is a claim
   * about the whole run rather than about this instant.
   *
   * It is the only mechanical evidence for #14's "does not drop the SSE connection",
   * and it has to be counted here rather than off `page.on('request')` — the stream
   * never reaches the network in this fixture, because `EventSource` itself is what
   * is replaced.
   */
  streams: () => Promise<number>;
};

/**
 * The room as the API would derive it from a call log. `calls` is that log — the
 * fixture's single source for which squares are marked *and* for the seq each one
 * carries, because a retraction names the CALL by seq and a second source would be
 * a second answer. It was two sources once, and both of the ways that went wrong
 * are recorded at the `/call` route below.
 */
function gameFor(stage: Stage, calls: Mark[]): Game {
  const deckSquares = [...CARD, ...DECK_EXTRA];
  const byId = new Map(calls.map((call) => [call.squareId, call]));
  const onTheCard = CARD.filter((square) => byId.has(square.id));

  const prizes: PrizeAward[] =
    stage === 'start'
      ? []
      : stage === 'mid'
        ? [{ seq: 40, prizeKind: 'LINE', playerId: GUEST.id, name: GUEST.name }]
        : [
            { seq: 40, prizeKind: 'LINE', playerId: GUEST.id, name: GUEST.name },
            { seq: 52, prizeKind: 'TWO_LINES', playerId: HOST.id, name: HOST.name },
            { seq: 61, prizeKind: 'FULL_HOUSE', playerId: LONG_NAME.id, name: LONG_NAME.name },
          ];

  const timeline: TimelineEntry[] = calls.map((call, index) => ({
    seq: call.seq,
    squareId: call.squareId,
    elapsed: `+${String(index * 7).padStart(2, '0')}:${String((index * 13) % 60).padStart(2, '0')}`,
    playerId: call.actorPlayerId,
    name: ROSTER.players.find((player) => player.id === call.actorPlayerId)!.name,
  }));

  return {
    id: GAME_ID,
    state: stage === 'done' ? 'done' : 'live',
    freeCentre: 'LIGHTS OUT',
    card: CARD,
    deck: {
      squares: deckSquares,
      // In deck order, as the API sends it, and carrying the row rather than the
      // id — which is what the sheet takes a call back by.
      called: deckSquares
        .map((square) => byId.get(square.id))
        .filter((call): call is Mark => call !== undefined),
    },
    marks: onTheCard.map((square) => byId.get(square.id)!),
    // A late joiner's greyed marks, which have to read as distinct from earned ones.
    inheritedMarks:
      stage === 'mid' ? onTheCard.slice(0, 2).map((square) => square.id) : [],
    prizes,
    standings: ROSTER.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      marks: Math.max(0, calls.length - index * 2),
    })),
    timeline,
    streamedThroughSeq: 200,
  };
}

/**
 * Put a room on screen at a given stage and hand back the two things a test needs to
 * drive it. Everything the app asks the API for is answered here; nothing leaves the
 * machine.
 */
export async function openRoom(page: Page, stage: Stage): Promise<Fixture> {
  const marked =
    stage === 'start'
      ? []
      : stage === 'done'
        ? CARD.map((square) => square.id)
        : CARD.slice(0, 12).map((square) => square.id);

  /**
   * The room's call log, and the fixture's one source of truth for a seq. The
   * pre-seeded calls keep the `100 + index` seqs and the alternating spotter the
   * timeline was written against; everything the routes below append lands here too.
   */
  const calls: Mark[] = marked.map((squareId, index) => ({
    squareId,
    seq: 100 + index,
    actorPlayerId: index % 2 === 0 ? GUEST.id : LONG_NAME.id,
  }));

  /**
   * `EventSource` cannot be served through `page.route` — a fulfilled response is a
   * whole body, and a stream is the one thing it is not. So the real thing is
   * replaced before any app code runs, with a hook the test emits down. The app is
   * unchanged: it still opens a stream at the same URL and still parses the same
   * frames.
   */
  await page.addInitScript(() => {
    class GateEventSource extends EventTarget {
      static live: GateEventSource[] = [];
      readyState = 1;
      constructor(readonly url: string) {
        super();
        GateEventSource.live.push(this);
      }
      close() {
        this.readyState = 2;
      }
    }

    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      value: GateEventSource,
    });
    Object.defineProperty(window, '__gateEmit', {
      configurable: true,
      value: (payload: unknown) => {
        for (const source of GateEventSource.live) {
          if (source.readyState !== 2) {
            source.dispatchEvent(
              new MessageEvent('message', { data: JSON.stringify(payload) }),
            );
          }
        }
      },
    });

    window.localStorage.setItem('twinion-bingo:token:ABCD', 'gate-token');
  });

  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/rooms/ABCD/game', (route) =>
    json(route, gameFor(stage, calls)),
  );
  await page.route('**/rooms/ABCD', (route) => json(route, ROSTER));
  /**
   * A CALL row is named by its `seq` and a retraction names it back, so the fixture
   * appends to the one log rather than keeping a mapping beside a list of marked
   * ids. It kept one, and that was wrong twice over: the pre-seeded marks carried
   * seqs the mapping did not, so a retraction from the card's confirm dialog
   * answered `200 OK` and unmarked nothing; and calling an already-marked square
   * returned a seq mapping to a *different* square, so an undo would have taken back
   * the wrong mark.
   */
  let nextSeq = 300;

  await page.route(`**/games/${GAME_ID}/call`, (route) => {
    const { square_id: squareId } = JSON.parse(
      route.request().postData() ?? '{}',
    ) as { square_id: string };

    // One square, one live call: a losing tap is handed back the call that won,
    // which is `appended: false` and opens no undo window.
    const existing = calls.find((call) => call.squareId === squareId);
    if (existing !== undefined) {
      return json(route, { ...existing, appended: false });
    }

    nextSeq += 1;
    const appended = { squareId, seq: nextSeq, actorPlayerId: HOST.id };
    calls.push(appended);

    return json(route, { ...appended, appended: true });
  });

  await page.route(`**/games/${GAME_ID}/retract`, (route) => {
    const { seq } = JSON.parse(route.request().postData() ?? '{}') as { seq: number };
    const target = calls.findIndex((call) => call.seq === seq);

    // A seq the log never handed out is a 409 in the API, and answering 200 here is
    // how this fixture used to make a broken retraction look like a working one.
    if (target === -1) {
      return route.fulfill({ status: 409, contentType: 'application/json', body: '{}' });
    }

    calls.splice(target, 1);

    return json(route, { targetSeq: seq, appended: true });
  });

  await page.goto('/r/ABCD');
  await page.getByLabel('Your card').waitFor();
  // The webfont decides every cell's metrics, and it arrives after the first paint
  // (`display: 'swap'`). Measuring before it lands grades the card on the fallback
  // face, which is the mistake #12 made and had to re-run for.
  await page.evaluate(() => document.fonts.ready);

  return {
    emit: (event) => page.evaluate((payload) => {
      (window as unknown as { __gateEmit: (p: unknown) => void }).__gateEmit(payload);
    }, event),
    square: (index) => CARD[index]!,
    streams: () =>
      page.evaluate(
        () => (window.EventSource as unknown as { live: unknown[] }).live.length,
      ),
  };
}

/**
 * Everything before the deal. These screens are not new in #13, but their chrome is:
 * the game screen went full-bleed, so the `max-w-md` centred column moved off the page
 * and into each pre-game state. That changed their layout, which makes them the gate's
 * business — `docs/SURFACES.md` had them down as unverified since #4.
 */
export type Lobby = 'needs-a-name' | 'roster' | 'host-lobby' | 'missing' | 'unreachable';

export async function openLobby(page: Page, state: Lobby): Promise<void> {
  await page.addInitScript(() => {
    // No stream before a game, but the app opens one as soon as the roster lands.
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      value: class extends EventTarget {
        readyState = 1;
        constructor(readonly url: string) {
          super();
        }
        close() {
          this.readyState = 2;
        }
      },
    });
  });

  if (state !== 'needs-a-name') {
    await page.addInitScript(() => {
      window.localStorage.setItem('twinion-bingo:token:ABCD', 'gate-token');
    });
  }

  // A room in its lobby has no game, which the API answers as a 404 rather than as an
  // error — the normal state of a room nobody has started yet.
  await page.route('**/rooms/ABCD/game', (route) => route.fulfill({ status: 404 }));

  await page.route('**/rooms/ABCD', (route) => {
    if (state === 'missing') return route.fulfill({ status: 404 });
    // An API that cannot be reached at all, which has to read differently from a
    // room that does not exist.
    if (state === 'unreachable') return route.abort('connectionrefused');

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...ROSTER,
        you:
          state === 'needs-a-name'
            ? null
            : state === 'host-lobby'
              ? HOST
              : GUEST,
      }),
    });
  });

  await page.goto('/r/ABCD');
  await page.evaluate(() => document.fonts.ready);
}

export { CARD, GUEST, HOST, LONG_NAME };
