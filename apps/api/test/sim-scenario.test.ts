import { describe, expect, it } from 'vitest';
import { CARD_SQUARES, DECK_SIZE } from '../src/games/deck.js';
import type { RoomEvent } from '../src/rooms/events.js';
import {
  before,
  liveCalls,
  marksOf,
  rungsOf,
  standingsOf,
  timelineOf,
  winnersOf,
  type SimCard,
} from '../src/sim/reduce.js';
import { buildScenario, type SimHand } from '../src/sim/scenario.js';

/**
 * The two pure halves of the replay simulator, tested where the simulator
 * itself cannot be: with no server, no Postgres and no three minutes. The sim
 * is a deployment check; these are the parts of it that can be a unit test.
 */

/** A deck of 40 and five overlapping cards of 24, dealt without any randomness. */
function deal(players = 5): SimHand[] {
  const deck = Array.from({ length: DECK_SIZE }, (_, index) => `sq-${index}`);

  return Array.from({ length: players }, (_, player) => ({
    playerId: `p${player}`,
    name: `Sim ${player}`,
    // A rotating window of 24 out of 40, so any two cards share at least eight.
    squareIds: Array.from(
      { length: CARD_SQUARES },
      (_, cell) => deck[(player * 3 + cell) % DECK_SIZE]!,
    ),
  }));
}

const cardsOf = (hands: SimHand[]): SimCard[] =>
  hands.map((hand, index) => ({ ...hand, joinSeq: index + 1 }));

/**
 * The script, played against a log rather than a server: one CALL row unless the
 * square already has a live one, and a RETRACT naming the row it supersedes.
 * That is the server's rule (ADR-0004, D8) and it is all the script depends on.
 */
function replay(hands: SimHand[]): RoomEvent[] {
  const scenario = buildScenario(hands);
  const events: RoomEvent[] = [];
  const seqByTag = new Map<string, number>();
  const live = new Map<string, number>();
  let seq = hands.length;
  let done = false;

  const append = (event: Omit<RoomEvent, 'seq' | 'at'>): RoomEvent => {
    seq += 1;
    const row = { ...event, seq, at: new Date(seq * 1000).toISOString() };
    events.push(row);

    return row;
  };

  for (const step of scenario.steps) {
    for (const action of step.actions) {
      if (done) continue;

      if (action.kind === 'call') {
        const existing = live.get(action.squareId);
        if (existing !== undefined) {
          if (action.tag !== undefined) seqByTag.set(action.tag, existing);
          continue;
        }

        const row = append({
          kind: 'CALL',
          gameId: 'game',
          actorPlayerId: hands[action.player]!.playerId,
          squareId: action.squareId,
          targetSeq: null,
          prizeKind: null,
        });
        live.set(action.squareId, row.seq);
        if (action.tag !== undefined) seqByTag.set(action.tag, row.seq);
      }

      if (action.kind === 'retract') {
        const targetSeq = seqByTag.get(action.target)!;
        const target = events.find((event) => event.seq === targetSeq)!;
        append({
          kind: 'RETRACT',
          gameId: 'game',
          actorPlayerId: hands[action.player]!.playerId,
          squareId: null,
          targetSeq,
          prizeKind: null,
        });
        live.delete(target.squareId!);
      }

      if (action.kind === 'call-when-done') done = true;
    }

    // The ladder, settled in the calling transaction the way the server does it.
    for (const kind of ['LINE', 'TWO_LINES', 'FULL_HOUSE'] as const) {
      if (events.some((event) => event.prizeKind === kind)) continue;

      const winners = winnersOf(cardsOf(hands), liveCalls(events, 'game'), kind);
      for (const playerId of winners) {
        append({
          kind: 'PRIZE',
          gameId: 'game',
          actorPlayerId: playerId,
          squareId: null,
          targetSeq: null,
          prizeKind: kind,
        });
      }
      if (kind === 'FULL_HOUSE' && winners.length > 0) done = true;
    }
  }

  return events;
}

describe('the replay script', () => {
  const hands = deal();
  const scenario = buildScenario(hands);
  const actions = scenario.steps.flatMap((step) => step.actions);

  it('is the same script every time, given the same hands', () => {
    expect(buildScenario(deal())).toStrictEqual(scenario);
  });

  it('calls from cards their player actually holds', () => {
    const offCard = actions.filter(
      (action) =>
        action.kind === 'call' &&
        !hands[action.player]!.squareIds.includes(action.squareId),
    );

    expect(offCard).toStrictEqual([]);
  });

  /**
   * The half of D8 the server enforces: your own call, or any call if you are
   * the host. The graduated friction on top of it — one tap inside ten seconds,
   * a confirmation after — is the client's and is covered in the web suite, not
   * here: a retraction over HTTP looks the same whichever button sent it.
   */
  it('takes back two calls as their caller and one as the host', () => {
    const calledBy = new Map(
      actions.flatMap((action) =>
        action.kind === 'call' && action.tag !== undefined
          ? [[action.tag, action.player] as const]
          : [],
      ),
    );
    const retracts = actions.filter((action) => action.kind === 'retract');

    expect(
      retracts.map((action) =>
        action.kind === 'retract'
          ? { by: action.player, madeBy: calledBy.get(action.target) }
          : null,
      ),
    ).toStrictEqual([
      { by: calledBy.get('fast'), madeBy: calledBy.get('fast') },
      { by: 0, madeBy: calledBy.get('host-target') },
      { by: calledBy.get('slow'), madeBy: calledBy.get('slow') },
    ]);
    // The host's is the one that is somebody else's call to take back.
    expect(calledBy.get('host-target')).not.toBe(0);
  });

  /**
   * One of the two self-retractions names a call the log has moved well past —
   * far enough that the client offering it would have been offering the dialog
   * rather than the toast. `target_seq` pointing a long way below the head is
   * the part of that the server is on the hook for.
   */
  it('leaves the log to move past a call before that call is taken back', () => {
    const tickMs = 1500;
    const called = scenario.steps.findIndex((step) =>
      step.actions.some((action) => action.kind === 'call' && action.tag === 'slow'),
    );
    const takenBack = scenario.steps.findIndex((step) =>
      step.actions.some(
        (action) => action.kind === 'retract' && action.target === 'slow',
      ),
    );

    expect(called).toBeGreaterThanOrEqual(0);
    expect((takenBack - called) * tickMs).toBeGreaterThan(10_000);
  });

  it('puts two devices on one square in one tick, twice', () => {
    const contested = scenario.steps.filter((step) => {
      const squares = step.actions
        .filter((action) => action.kind === 'call')
        .map((action) => (action.kind === 'call' ? action.squareId : ''));

      return new Set(squares).size < squares.length;
    });

    // The re-call race a retraction opens, and the plain duplicate call.
    expect(contested).toHaveLength(2);
  });

  it('takes one device off the air for a stint and brings it back', () => {
    const offline = scenario.steps.findIndex((step) =>
      step.actions.some((action) => action.kind === 'drop'),
    );
    const back = scenario.steps.findIndex((step) =>
      step.actions.some((action) => action.kind === 'resume'),
    );

    expect(back - offline).toBeGreaterThan(8);
  });

  /**
   * The full house is a one-way door (D5, ADR-0003), so an accidental one before
   * the march would turn every remaining step into a 409.
   */
  it('completes no card before the march', () => {
    const called = new Set<string>();
    const squareByTag = new Map<string, string>();

    for (const step of scenario.steps) {
      if (step.phase === 'march') break;

      for (const action of step.actions) {
        if (action.kind === 'call') {
          called.add(action.squareId);
          if (action.tag !== undefined) squareByTag.set(action.tag, action.squareId);
        }
        if (action.kind === 'retract') called.delete(squareByTag.get(action.target)!);
      }

      expect(
        hands.filter((hand) => hand.squareIds.every((id) => called.has(id))),
      ).toStrictEqual([]);
    }
  });

  it("retires a retracted square that is not on the closer's card", () => {
    expect(scenario.retired).toHaveLength(1);
    expect(hands[scenario.closer]!.squareIds).not.toContain(scenario.retired[0]);
  });

  it('ends with one call into the finished game', () => {
    expect(actions.at(-1)?.kind).toBe('call-when-done');
  });
});

describe('the script played against a log', () => {
  const hands = deal();
  const cards = cardsOf(hands);
  const events = replay(hands);
  const rungs = rungsOf(events, 'game');

  it('climbs the ladder in order and ends in a full house', () => {
    expect(rungs.map((rung) => rung.kind)).toStrictEqual([
      'LINE',
      'TWO_LINES',
      'FULL_HOUSE',
    ]);
  });

  /**
   * The march drives the closer's card, but by the end the room has called most
   * of a forty-square deck and more than one card is a square from full — so the
   * rung can land on somebody else's, and the script stops on whichever call
   * closed the game rather than scripting a 409 after it.
   */
  it("marches the closer's card until somebody's is full", () => {
    const closer = cards[buildScenario(hands).closer]!;
    const full = cards.filter(
      (card) => marksOf(card, liveCalls(events, 'game')).length === CARD_SQUARES,
    );

    expect(full.length).toBeGreaterThan(0);
    expect(marksOf(closer, liveCalls(events, 'game')).length).toBeGreaterThanOrEqual(
      CARD_SQUARES - 1,
    );
  });

  it('awards each rung to whoever qualified on the log below it', () => {
    for (const rung of rungs) {
      const qualified = winnersOf(
        cards,
        liveCalls(before(events, rung.at), 'game'),
        rung.kind as 'LINE' | 'TWO_LINES' | 'FULL_HOUSE',
      );

      expect([...rung.winners].sort()).toStrictEqual(qualified.sort());
    }
  });
});

describe('the independent reducer', () => {
  const cards: SimCard[] = [
    { playerId: 'p0', name: 'Ada', joinSeq: 1, squareIds: ['a', 'b', 'c'] },
    { playerId: 'p1', name: 'Bo', joinSeq: 2, squareIds: ['b', 'd'] },
  ];

  const row = (event: Partial<RoomEvent> & { seq: number; kind: string }): RoomEvent => ({
    at: new Date(event.seq * 1000).toISOString(),
    gameId: 'game',
    actorPlayerId: 'p0',
    squareId: null,
    targetSeq: null,
    prizeKind: null,
    ...event,
  });

  const events = [
    row({ seq: 1, kind: 'PLAYER_JOINED' }),
    row({ seq: 3, kind: 'CALL', squareId: 'a' }),
    row({ seq: 4, kind: 'CALL', squareId: 'b', actorPlayerId: 'p1' }),
    row({ seq: 5, kind: 'RETRACT', targetSeq: 3 }),
    row({ seq: 9, kind: 'CALL', squareId: 'a' }),
  ];

  it('drops a call a RETRACT supersedes, and keeps the call that replaced it', () => {
    expect(liveCalls(events, 'game').map((call) => call.seq)).toStrictEqual([4, 9]);
  });

  it('ignores rows belonging to another game', () => {
    expect(liveCalls(events, 'other')).toStrictEqual([]);
  });

  it('marks in card order, not log order', () => {
    expect(marksOf(cards[0]!, liveCalls(events, 'game'))).toStrictEqual(['a', 'b']);
  });

  it('ranks by raw mark count, leaving ties in join order', () => {
    expect(standingsOf(cards, liveCalls(events, 'game'))).toStrictEqual([
      { playerId: 'p0', name: 'Ada', marks: 2 },
      { playerId: 'p1', name: 'Bo', marks: 1 },
    ]);
  });

  /** Newest first, as CONTEXT.md defines the timeline — not log order. */
  it('credits the timeline to whoever spotted each call, newest first', () => {
    expect(timelineOf(cards, liveCalls(events, 'game'))).toStrictEqual([
      { seq: 9, squareId: 'a', playerId: 'p0', name: 'Ada' },
      { seq: 4, squareId: 'b', playerId: 'p1', name: 'Bo' },
    ]);
  });

  /** A mark you walked in on is yours to look at and not to win with. */
  it('does not count a call that landed before a player joined', () => {
    const squareIds = deal(1)[0]!.squareIds;
    const filled = squareIds.map((squareId, index) =>
      row({ seq: index + 1, kind: 'CALL', squareId }),
    );
    const card = (joinSeq: number): SimCard => ({
      playerId: 'p2',
      name: 'Cy',
      joinSeq,
      squareIds,
    });

    expect(marksOf(card(999), liveCalls(filled, 'game'))).toHaveLength(CARD_SQUARES);
    expect(winnersOf([card(999)], liveCalls(filled, 'game'), 'FULL_HOUSE')).toStrictEqual([]);
    expect(winnersOf([card(1)], liveCalls(filled, 'game'), 'FULL_HOUSE')).toStrictEqual(['p2']);
  });

  it('reads the log as it stood below a seq', () => {
    expect(before(events, 5).map((event) => event.seq)).toStrictEqual([1, 3, 4]);
  });
});
