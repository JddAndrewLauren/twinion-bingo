import { LINES } from '../games/lines.js';

/**
 * One player's card as the script sees it. Cards are dealt at random per game,
 * so the script is built *after* the deal — but from the hands alone, with no
 * randomness of its own, so the same hands always produce the same script.
 */
export type SimHand = {
  playerId: string;
  name: string;
  squareIds: string[];
};

/**
 * A tagged action's tag is how a later step names an earlier row. A retraction
 * needs the CALL's `seq`, which only exists once the call has been made, so the
 * script refers to the call by tag and the runner resolves it.
 */
export type Action =
  | { kind: 'call'; player: number; squareId: string; tag?: string }
  | { kind: 'retract'; player: number; target: string }
  | { kind: 'drop'; player: number }
  | { kind: 'resume'; player: number }
  | { kind: 'call-when-done'; player: number; squareId: string };

export type Phase =
  | 'warm-up'
  | 'corrections'
  | 'duplicate'
  | 'offline'
  | 'march'
  | 'post-done';

/** One tick. Everything in a step goes out together, which is what a race is. */
export type Step = { phase: Phase; actions: Action[] };

export type Scenario = {
  steps: Step[];
  /** The player whose card is filled to the full house, ending the game. */
  closer: number;
  /** The player taken offline mid-replay and resumed from `Last-Event-ID`. */
  dropped: number;
  /** Squares retracted and deliberately never called again. */
  retired: string[];
};

export type ScenarioOptions = {
  /** How far apart the runner spaces steps; the slow-undo gap is counted in it. */
  tickMs?: number;
  warmUpCalls?: number;
  offlineCalls?: number;
};

/** D8's dialog threshold. A "slow" undo has to land on the far side of it. */
const UNDO_TOAST_MS = 10_000;

/** At most this many calls are spent waiting the threshold out; then, ticks. */
const GAP_CALLS = 4;

/**
 * The scripted race, in order:
 *
 * 1. a warm-up of ordinary calls, shared squares first;
 * 2. the three correction paths, plus the re-call race a retraction opens up;
 * 3. two devices calling one square in the same tick;
 * 4. a device off the air for a stint, then resumed;
 * 5. the march up the ladder to the full house;
 * 6. one call into the finished game.
 *
 * Pure and total: given the same hands and options it emits the same steps, so
 * a failing run can be reasoned about from the printed script rather than
 * re-run and hoped at.
 *
 * Nothing before the march is allowed to complete anybody's card. A full house
 * closes the game one way (D5, ADR-0003), so an accidental one mid-script would
 * turn every remaining step into a 409 — and the point of the march is that the
 * ladder is climbed deliberately, with the log watched at every rung.
 */
export function buildScenario(
  hands: readonly SimHand[],
  options: ScenarioOptions = {},
): Scenario {
  if (hands.length < 2) {
    throw new Error('the script needs a host and at least one other player');
  }

  const { tickMs = 1500, warmUpCalls = 10, offlineCalls = 14 } = options;

  // A non-host closes, so every call of the march is scope-checked against a
  // card (D7) rather than against the host's whole-deck exemption.
  const closer = 1;
  const dropped = Math.min(2, hands.length - 1);

  const holders = new Map<string, number[]>();
  for (const [index, hand] of hands.entries()) {
    for (const id of hand.squareIds) {
      holders.set(id, [...(holders.get(id) ?? []), index]);
    }
  }

  // Everything before the march spends the sixteen-odd squares the closer does
  // not hold first, so the march is still a march: a deck is forty squares and a
  // card is twenty-four of them, so calling the shared ones freely would leave
  // the closer one square from a full house before the ladder was ever climbed.
  // Within that, shared squares first — a call several cards are watching for is
  // the one that exercises the fan-out, and the correction and duplicate steps
  // need one.
  const onCloserCard = new Set(hands[closer]?.squareIds ?? []);
  const candidates = [...holders.keys()]
    .sort((a, b) => (holders.get(b)?.length ?? 0) - (holders.get(a)?.length ?? 0))
    .sort((a, b) => Number(onCloserCard.has(a)) - Number(onCloserCard.has(b)));

  const called = new Set<string>();
  const retired = new Set<string>();
  const steps: Step[] = [];
  let rotation = 0;

  const holdersOf = (squareId: string): number[] => holders.get(squareId) ?? [];

  /** Round-robin among the players who actually hold the square (D7). */
  const callerFor = (squareId: string): number => {
    const eligible = holdersOf(squareId);
    const player = eligible[rotation % eligible.length];
    rotation += 1;

    return player ?? 0;
  };

  const finishesACard = (squareId: string): boolean =>
    hands.some((hand) =>
      hand.squareIds.every((id) => id === squareId || called.has(id)),
    );

  /** The next callable square, skipping anything that would end the game. */
  const nextSquare = (accepts: (squareId: string) => boolean = () => true): string | undefined =>
    candidates.find(
      (id) =>
        !called.has(id) && !retired.has(id) && accepts(id) && !finishesACard(id),
    );

  const callStep = (phase: Phase, squareId: string, player: number, tag?: string): void => {
    called.add(squareId);
    steps.push({ phase, actions: [{ kind: 'call', player, squareId, tag }] });
  };

  // 1. Warm-up.
  for (let taken = 0; taken < warmUpCalls; taken += 1) {
    const squareId = nextSquare();
    if (squareId === undefined) break;
    callStep('warm-up', squareId, callerFor(squareId));
  }

  // The host's retraction has to land on somebody else's call (D8), so it names
  // the first warm-up call the round robin gave to a player other than the host.
  const hostTarget = steps
    .flatMap((step) => step.actions)
    .find((action) => action.kind === 'call' && action.player !== 0);
  if (hostTarget?.kind === 'call') hostTarget.tag = 'host-target';

  // 2. Corrections. The slow undo's square is chosen off the closer's card so
  // that retiring it cannot stand between the closer and the full house.
  const slowSquare = nextSquare(
    (id) => !hands[closer]!.squareIds.includes(id),
  );
  const slowCaller = slowSquare === undefined ? 0 : callerFor(slowSquare);
  if (slowSquare !== undefined) {
    callStep('corrections', slowSquare, slowCaller, 'slow');
  }
  const slowCalledAt = steps.length;

  // The fast undo's square is re-called by two devices a tick later, so it has
  // to be one at least two cards hold.
  const fastSquare = nextSquare((id) => holdersOf(id).length >= 2);
  const fastCaller = fastSquare === undefined ? 0 : callerFor(fastSquare);
  if (fastSquare !== undefined) {
    callStep('corrections', fastSquare, fastCaller, 'fast');
    // Inside the ten seconds: one tap, no dialog.
    steps.push({ phase: 'corrections', actions: [{ kind: 'retract', player: fastCaller, target: 'fast' }] });
    called.delete(fastSquare);
  }

  if (hostTarget?.kind === 'call') {
    steps.push({ phase: 'corrections', actions: [{ kind: 'retract', player: 0, target: 'host-target' }] });
    called.delete(hostTarget.squareId);
  }

  // The re-call race a retraction opens (#45): a square whose call was taken
  // back is callable again, and two devices spot that at once.
  if (fastSquare !== undefined) {
    const [first, second] = holdersOf(fastSquare);
    if (first !== undefined && second !== undefined) {
      steps.push({
        phase: 'corrections',
        actions: [
          { kind: 'call', player: first, squareId: fastSquare, tag: 'race-a' },
          { kind: 'call', player: second, squareId: fastSquare, tag: 'race-b' },
        ],
      });
      called.add(fastSquare);
    }
  }

  // Wait out D8's ten-second threshold, which is the difference between the
  // one-tap toast and the confirmation dialog. A few calls fill the time and
  // then the room simply watches the race: the deck is forty squares and the
  // phases after this one need most of them, so a fast `--tick-ms` must not be
  // able to spend the whole deck getting to one retraction.
  if (slowSquare !== undefined) {
    const gap = Math.ceil(UNDO_TOAST_MS / tickMs) + 1;
    for (let filler = 0; filler < GAP_CALLS && steps.length - slowCalledAt < gap; filler += 1) {
      const squareId = nextSquare();
      if (squareId === undefined) break;
      callStep('corrections', squareId, callerFor(squareId));
    }
    while (steps.length - slowCalledAt < gap) {
      steps.push({ phase: 'corrections', actions: [] });
    }

    // Their own call, well past the toast: the client's dialog path (D8).
    steps.push({ phase: 'corrections', actions: [{ kind: 'retract', player: slowCaller, target: 'slow' }] });
    called.delete(slowSquare);
    retired.add(slowSquare);
  }

  // 3. Two devices, one square, one tick.
  const duplicateSquare = nextSquare((id) => holdersOf(id).length >= 2);
  if (duplicateSquare !== undefined) {
    const [first, second] = holdersOf(duplicateSquare);
    if (first !== undefined && second !== undefined) {
      steps.push({
        phase: 'duplicate',
        actions: [
          { kind: 'call', player: first, squareId: duplicateSquare, tag: 'dup-a' },
          { kind: 'call', player: second, squareId: duplicateSquare, tag: 'dup-b' },
        ],
      });
      called.add(duplicateSquare);
    }
  }

  // 4. A device off the air for a stint of the race.
  steps.push({ phase: 'offline', actions: [{ kind: 'drop', player: dropped }] });
  for (let taken = 0; taken < offlineCalls; taken += 1) {
    const squareId = nextSquare();
    if (squareId === undefined) break;
    callStep('offline', squareId, callerFor(squareId));
  }
  steps.push({ phase: 'offline', actions: [{ kind: 'resume', player: dropped }] });

  // 5. The march. A line first, then a second line crossing it, then the rest —
  // so the ladder is climbed a rung at a time rather than in one call.
  const closerHand = hands[closer]!;
  const marchOrder = [
    ...(LINES[0] ?? []),
    ...(LINES[5] ?? []),
    ...closerHand.squareIds.keys(),
  ];

  const remaining: string[] = [];
  for (const index of marchOrder) {
    const squareId = closerHand.squareIds[index];
    if (squareId === undefined) continue;
    if (called.has(squareId) || remaining.includes(squareId)) continue;
    remaining.push(squareId);
  }

  while (remaining.length > 0) {
    /**
     * A card is 24 of a 40-square deck, so by the end of the march the room has
     * called nearly the whole deck and more than one card is a square from full.
     * The script cannot stop that, and it does not try: it takes the squares
     * that finish nobody first, and when only closing squares are left it takes
     * the closer's own. What it must do is stop *exactly* on the call that
     * closes the game — the door is one-way (D5, ADR-0003), and a march that
     * carried on would be scripting a 409.
     */
    const finishes = (squareId: string, hand: SimHand): boolean =>
      hand.squareIds.every((held) => held === squareId || called.has(held));

    const squareId =
      remaining.find((id) => !hands.some((hand) => finishes(id, hand))) ??
      remaining.find((id) => finishes(id, closerHand)) ??
      remaining[0]!;

    remaining.splice(remaining.indexOf(squareId), 1);
    const closesTheGame = hands.some((hand) => finishes(squareId, hand));
    callStep('march', squareId, closer);
    if (closesTheGame) break;
  }

  // 6. The full house is a one-way door (D5, ADR-0003).
  steps.push({
    phase: 'post-done',
    actions: [
      { kind: 'call-when-done', player: closer, squareId: closerHand.squareIds[0]! },
    ],
  });

  return { steps, closer, dropped, retired: [...retired] };
}
