/**
 * PROTOTYPE — mock state for #12. Delete with the rest of this folder.
 *
 * Shaped as the real `Game` and `Roster` so the variants can hand pieces of it to
 * the real `Results`, and so nothing here has to be re-learned when a decision
 * folds into #13/#14. No API, no token, no stream: the question this prototype
 * answers is about layout, and mock state is the point rather than a shortcut.
 *
 * Four label sets, because the issue asks for a decision about the <=30 char cap
 * (D4) and one set cannot settle it. They are a *length* axis — pair them with the
 * text-size axis in `proto-card.tsx` and the two together are the whole question of
 * how much a cell can say:
 *
 * - `short` — <=16 characters. What the cap would look like if #16 were told to
 *   write tersely: the control in the other direction from `real`.
 * - `real` — the committed 47-square pool's own longest labels. Longest single
 *   word 10 characters, which per docs/SURFACES.md is *exactly* the width an iPad
 *   cell fits. This is what is on screen today.
 * - `cap`  — plausible labels at the cap whose long words are 11-13 characters:
 *   `investigation`, `championship`, `disqualified`, `reprimanded`. Ordinary
 *   motorsport vocabulary that #16 will author, and the case #47 says overflows.
 * - `long` — 32-41 characters, i.e. *over* the cap. Not a proposal; it is what
 *   raising the cap would cost, so the decision to keep 30 is made against
 *   something rather than in the abstract.
 *
 * Judge every variant against `cap`. The other three say how much room the cap has
 * on either side.
 *
 * Note that `real` and `cap` both top out at 28 characters — what separates them is
 * the longest *word*, 10 against 13, which is what a cell actually breaks on. So the
 * length axis is really 16 / 28-with-short-words / 28-with-long-words / 41.
 */

import type { CardSquare, Game, Roster } from '../../room-api';

export type LabelSet = 'short' | 'real' | 'cap' | 'long';

/** The length axis in the order it reads on the switcher, shortest first. */
export const LABEL_SETS: readonly LabelSet[] = [
  'short',
  'real',
  'cap',
  'long',
] as const;

/** What the switcher calls each set, with the length it stresses. */
export const LABEL_SET_NAMES: Record<LabelSet, string> = {
  short: 'short 16',
  real: 'real 28 w10',
  cap: 'cap 28 w13',
  long: 'over cap 41',
};

export function asLabelSet(asked: string | null): LabelSet {
  return LABEL_SETS.find((set) => set === asked) ?? 'cap';
}

/**
 * How far into the game the mock sits.
 *
 * - `mid` — twelve of twenty-four called, one line and two-lines already won.
 * - `start` — lights out: nothing called, so the "what am I looking for" list is all
 *   **24** rows, which is its worst case and the one the list has to survive. It is
 *   also the only state in which the longest descriptions are visible at all, since
 *   the list carries open squares and the longest prose sits on squares that `mid`
 *   has already marked.
 */
export type Stage = 'mid' | 'start';

/**
 * A square as the pool actually carries it (D4): a `label` of <=30 characters for
 * the cell, and a `description` that says exactly what counts. The "what am I
 * looking for" list is what makes the second one load-bearing rather than a
 * long-press nicety, so these are written to disambiguate, not to pad.
 */
type MockSquare = { label: string; tier: string; description: string };

/**
 * Terse labels: <=16 characters. The longest word is still 10 (`Verstappen`) — a
 * driver's surname is the length it is, and no authoring brief shortens it, so the
 * hardest thing a cell has to fit does not change on this axis. The set exists to
 * show the cell with room to spare, so that "the cap is too generous" is a judgement
 * somebody can make rather than assume.
 */
const SHORT_LABELS: MockSquare[] = (
  [
    [
      'Safety car early',
      'medium',
      'Safety car or virtual safety car deployed on or before lap 10.',
    ],
    [
      'Verstappen moans',
      'medium',
      'Verstappen complains about the car over Red Bull team radio.',
    ],
    [
      'Hamilton moans',
      'medium',
      'Hamilton complains about the car over Ferrari team radio.',
    ],
    [
      'Leclerc moans',
      'medium',
      'Leclerc complains about the car over Ferrari team radio.',
    ],
    [
      'Norris moans',
      'medium',
      'Norris complains about the car over McLaren team radio.',
    ],
    [
      'Sainz moans',
      'medium',
      'Sainz complains about the car over Williams team radio.',
    ],
    [
      'Albon moans',
      'medium',
      'Albon complains about the car over Williams team radio.',
    ],
    ['Norris podium', 'certain', 'Norris finishes in the top three.'],
    ['Piastri podium', 'medium', 'Piastri finishes in the top three.'],
    ['Hadjar scores', 'rare', 'Hadjar finishes in the top ten.'],
    [
      'A car retires',
      'certain',
      'Any car stops for good, mechanical or otherwise.',
    ],
    [
      'Turn 1 contact',
      'certain',
      'Any contact between two cars at turn 1, on any lap.',
    ],
    [
      'Late rain',
      'rare',
      'Rain reaches the circuit after the last scheduled stops.',
    ],
    [
      'A pit lane start',
      'rare',
      'Any car begins the race from the pit lane rather than the grid.',
    ],
    [
      'Red Bull botch',
      'medium',
      'A Red Bull pit stop goes wrong — slow, unsafe or a wheel not on.',
    ],
    [
      'Ferrari botch',
      'medium',
      'A Ferrari pit stop goes wrong — slow, unsafe or a wheel not on.',
    ],
    [
      'A grid penalty',
      'medium',
      'Any driver drops grid places before the start.',
    ],
    [
      'A time penalty',
      'certain',
      'Any driver is given a time penalty during the race.',
    ],
    ['A reprimand', 'medium', 'Any driver is given a reprimand this weekend.'],
    [
      'A DSQ',
      'rare',
      'Any car is excluded from the results, before or after the race.',
    ],
    [
      'Fastest lap set',
      'certain',
      'The fastest lap of the race changes hands at least once.',
    ],
    [
      'Piastri leads',
      'medium',
      'Piastri crosses the line first at the end of any lap.',
    ],
    ['A puncture', 'rare', 'Any car picks up a puncture and stops for it.'],
    [
      'Radio bleeped',
      'certain',
      'A team radio message is bleeped by the broadcast.',
    ],
  ] as const
).map(([label, tier, description]) => ({
  label,
  tier,
  description,
}));

/** The committed pool's longest labels — longest word 10 (`Verstappen`). */
const REAL_LABELS: MockSquare[] = (
  [
    [
      'Verstappen moans at Red Bull',
      'medium',
      'Verstappen complains about the car over Red Bull team radio.',
    ],
    [
      'Hamilton moans at Ferrari',
      'medium',
      'Hamilton complains about the car over Ferrari team radio.',
    ],
    [
      'Hulkenberg moans at Audi',
      'certain',
      'Hulkenberg complains about the car over Audi team radio.',
    ],
    [
      'Leclerc moans at Ferrari',
      'medium',
      'Leclerc complains about the car over Ferrari team radio.',
    ],
    [
      'Piastri moans at McLaren',
      'medium',
      'Piastri complains about the car over McLaren team radio.',
    ],
    [
      'Hulkenberg on the podium',
      'rare',
      'Hulkenberg finishes in the top three.',
    ],
    [
      'Verstappen on the podium',
      'certain',
      'Verstappen finishes in the top three.',
    ],
    [
      'Hadjar moans at Red Bull',
      'medium',
      'Hadjar complains about the car over Red Bull team radio.',
    ],
    [
      'Albon moans at Williams',
      'medium',
      'Albon complains about the car over Williams team radio.',
    ],
    [
      'Bortoleto moans at Audi',
      'certain',
      'Bortoleto complains about the car over Audi team radio.',
    ],
    [
      'Norris moans at McLaren',
      'medium',
      'Norris complains about the car over McLaren team radio.',
    ],
    [
      'Sainz moans at Williams',
      'medium',
      'Sainz complains about the car over Williams team radio.',
    ],
    ['Bortoleto on the podium', 'rare', 'Bortoleto finishes in the top three.'],
    [
      'Red Bull fumbles a stop',
      'medium',
      'A Red Bull pit stop goes wrong \u2014 slow, unsafe or a wheel not on.',
    ],
    [
      'Safety car before lap 10',
      'medium',
      'Safety car or virtual safety car deployed on or before lap 10.',
    ],
    [
      'Ferrari fumbles a stop',
      'medium',
      'A Ferrari pit stop goes wrong \u2014 slow, unsafe or a wheel not on.',
    ],
    ['Norris on the podium', 'certain', 'Norris finishes in the top three.'],
    [
      'Rain in the final stint',
      'rare',
      'Rain reaches the circuit after the last scheduled stops.',
    ],
    [
      'A driver retires the car',
      'certain',
      'Any car stops for good, mechanical or otherwise.',
    ],
    [
      'Piastri leads a lap',
      'medium',
      'Piastri crosses the line first at the end of any lap.',
    ],
    [
      'Two cars touch at turn 1',
      'certain',
      'Any contact between two cars at turn 1, on any lap.',
    ],
    [
      'Leclerc sets fastest lap',
      'medium',
      'Leclerc holds the fastest lap of the race at any point.',
    ],
    [
      'A pit lane start',
      'rare',
      'Any car begins the race from the pit lane rather than the grid.',
    ],
    [
      'Hamilton passes on track',
      'medium',
      'Hamilton completes an overtake on track.',
    ],
  ] as const
).map(([label, tier, description]) => ({
  label,
  tier,
  description,
}));

/**
 * The cap's worst plausible case: 28-30 characters *and* a word of 11-13. Every
 * long word here is real motorsport vocabulary a commentator says once a race, so
 * a variant that cannot render these is a variant that constrains #16's authoring.
 *
 * The descriptions are the other half of the stress. The committed pool's run to
 * 64 characters, but several here are deliberately longer, because "clarifies
 * exactly what people are looking for" is a harder brief than "reminds you what
 * the label meant" — a list that only fits 64 would quietly cap the authoring.
 */
const CAP_LABELS: MockSquare[] = (
  [
    [
      'Verstappen investigation',
      'medium',
      'The stewards announce they are looking at Verstappen \u2014 noted, under investigation, or summoned. Any session, not only the race.',
    ],
    [
      'Stewards open investigation',
      'certain',
      'Any driver, any incident: the stewards confirm an investigation is under way. The announcement counts, not the verdict.',
    ],
    [
      'A driver is disqualified',
      'rare',
      'A classified finisher is removed from the results, or a car is excluded before the start. Post-race technical DSQs count.',
    ],
    [
      'Hulkenberg is reprimanded',
      'medium',
      'Hulkenberg is given a reprimand specifically \u2014 not a fine, not a grid drop, not a time penalty.',
    ],
    [
      'Championship lead changes',
      'rare',
      'The drivers\u2019 championship lead passes to a different driver, on the road or after the flag.',
    ],
    [
      'Championship maths on air',
      'certain',
      'A commentator works through points permutations out loud \u2014 \u201cif it finishes like this, then\u2026\u201d',
    ],
    [
      'Post-race investigation',
      'medium',
      'The stewards keep something open after the chequered flag, so the result is provisional.',
    ],
    [
      'Leclerc is reprimanded',
      'medium',
      'Leclerc specifically, and a reprimand specifically rather than any other penalty.',
    ],
    [
      'Grid penalty for a Red Bull',
      'medium',
      'Either Red Bull car drops grid places \u2014 a component, a gearbox, or impeding in qualifying.',
    ],
    [
      'Unsafe release investigation',
      'rare',
      'A car is let out of its box into traffic and the stewards look at it. The investigation counts even if no penalty follows.',
    ],
    [
      'Verstappen moans at Red Bull',
      'medium',
      'Verstappen complains about the car over team radio. Grumbling counts; a plain question does not.',
    ],
    [
      'Hulkenberg moans at Audi',
      'certain',
      'Hulkenberg complains about the car over Audi team radio.',
    ],
    [
      'Bortoleto on the podium',
      'rare',
      'Bortoleto finishes in the top three, as classified after any penalties.',
    ],
    [
      'Track limits investigation',
      'certain',
      'A track limits breach is announced as under investigation. A deleted lap on its own is not enough.',
    ],
    [
      'A reprimanded driver moans',
      'medium',
      'Any driver carrying a reprimand from this weekend complains on the radio afterwards.',
    ],
    [
      'Safety car before lap 10',
      'medium',
      'Safety car or virtual safety car deployed on or before lap 10.',
    ],
    [
      'Red Bull fumbles a stop',
      'medium',
      'A Red Bull pit stop goes wrong \u2014 slow, unsafe, or a wheel not on.',
    ],
    [
      'Disqualified from the grid',
      'rare',
      'A car is excluded before the start and begins from the pit lane, or not at all.',
    ],
    [
      'Championship rival retires',
      'medium',
      'Anyone in the top three of the standings fails to finish, whatever the cause.',
    ],
    [
      'Two cars touch at turn 1',
      'certain',
      'Any contact between two cars at turn 1, on any lap \u2014 a nudge counts, no damage needed.',
    ],
    [
      'Rain in the final stint',
      'rare',
      'Rain reaches the circuit after the last scheduled stops, wherever on the track.',
    ],
    [
      'Hamilton passes on track',
      'medium',
      'Hamilton completes an overtake on track. A place gained in the pits or by a retirement does not count.',
    ],
    [
      'Leclerc sets fastest lap',
      'medium',
      'Leclerc holds the fastest lap of the race at any point \u2014 it need not still stand at the flag.',
    ],
    [
      'A pit lane start',
      'certain',
      'Any car begins the race from the pit lane rather than its grid slot.',
    ],
  ] as const
).map(([label, tier, description]) => ({
  label,
  tier,
  description,
}));

/**
 * Over the cap: 32-41 characters, the same events as `cap` said at the length prose
 * naturally wants. Nobody is proposing this. It is here so the cell can be seen
 * failing — a label that needs four lines in a 68pt box is the argument for keeping
 * 30, and it is a better argument on screen than on paper.
 */
const LONG_LABELS: MockSquare[] = (
  [
    [
      'The stewards investigate Verstappen',
      'medium',
      'The stewards announce they are looking at Verstappen — noted, under investigation, or summoned.',
    ],
    [
      'A driver is disqualified post-race',
      'rare',
      'A classified finisher is removed from the results after the flag.',
    ],
    [
      'Hulkenberg is reprimanded by the stewards',
      'medium',
      'Hulkenberg is given a reprimand specifically — not a fine, not a grid drop.',
    ],
    [
      'The championship lead changes hands',
      'rare',
      'The drivers’ championship lead passes to a different driver.',
    ],
    [
      'A commentator does championship maths',
      'certain',
      'Points permutations worked through out loud — “if it finishes like this, then…”',
    ],
    [
      'The result is provisional at the flag',
      'medium',
      'The stewards keep something open after the chequered flag.',
    ],
    [
      'An unsafe release is investigated',
      'rare',
      'A car is let out of its box into traffic and the stewards look at it.',
    ],
    [
      'Verstappen moans at Red Bull on radio',
      'medium',
      'Verstappen complains about the car over team radio. Grumbling counts.',
    ],
    [
      'Track limits go under investigation',
      'certain',
      'A track limits breach is announced as under investigation.',
    ],
    [
      'A safety car before the tenth lap',
      'medium',
      'Safety car or virtual safety car deployed on or before lap 10.',
    ],
    [
      'Red Bull fumble a pit stop badly',
      'medium',
      'A Red Bull pit stop goes wrong — slow, unsafe, or a wheel not on.',
    ],
    [
      'Bortoleto finishes on the podium',
      'rare',
      'Bortoleto finishes in the top three, as classified after any penalties.',
    ],
    [
      'Rain arrives during the final stint',
      'rare',
      'Rain reaches the circuit after the last scheduled stops.',
    ],
    [
      'Two cars touch each other at turn 1',
      'certain',
      'Any contact between two cars at turn 1, on any lap — a nudge counts.',
    ],
    [
      'Hamilton completes a pass on track',
      'medium',
      'Hamilton completes an overtake on track, not in the pits.',
    ],
    [
      'Leclerc sets the fastest lap of the race',
      'medium',
      'Leclerc holds the fastest lap at any point — it need not still stand.',
    ],
    [
      'A car starts the race from the pit lane',
      'certain',
      'Any car begins the race from the pit lane rather than its grid slot.',
    ],
    [
      'A championship rival fails to finish',
      'medium',
      'Anyone in the top three of the standings fails to finish.',
    ],
    [
      'Somebody is investigated for weaving',
      'rare',
      'Any driver is looked at for moving around under braking or on a straight.',
    ],
    [
      'The virtual safety car is deployed',
      'certain',
      'A virtual safety car period specifically, rather than a full safety car.',
    ],
    [
      'A driver is summoned to the stewards',
      'medium',
      'A summons is announced — the driver has to attend, verdict or not.',
    ],
    [
      'Radio message bleeped by the director',
      'certain',
      'A team radio message is bleeped by the broadcast.',
    ],
    [
      'A wheel is not on at a Ferrari stop',
      'medium',
      'A Ferrari stop is released or held with a wheel not properly fitted.',
    ],
    [
      'Norris finishes on the podium again',
      'certain',
      'Norris finishes in the top three.',
    ],
  ] as const
).map(([label, tier, description]) => ({
  label,
  tier,
  description,
}));

/** The four sets, keyed by the switcher's length axis. */
const LABELS_BY_SET: Record<LabelSet, MockSquare[]> = {
  short: SHORT_LABELS,
  real: REAL_LABELS,
  cap: CAP_LABELS,
  long: LONG_LABELS,
};

/**
 * The deck-only squares' label, at each set's length. They are on nobody's card, so
 * they only ever show in the timeline — but the timeline is where a long label wraps
 * a row, so they have to grow with the axis rather than sit at one length.
 */
const DECK_ONLY_LABEL: Record<LabelSet, string> = {
  short: 'Antonelli moans',
  real: 'Antonelli moans at Mercedes',
  cap: 'Championship investigation',
  long: 'Antonelli moans at Mercedes on radio',
};

/**
 * `noUncheckedIndexedAccess` is on across this repo, and everything indexed below
 * is fixed-length mock data — so index and shout rather than thread optionality
 * through a file that is going to be deleted.
 */
function at<T>(list: readonly T[], index: number): T {
  const found = list[index];
  if (found === undefined) throw new Error(`mock-state: no index ${index}`);
  return found;
}

function cardFor(set: LabelSet): CardSquare[] {
  return LABELS_BY_SET[set].map((square, index) => ({
    id: `proto.v1:square_${index}`,
    ...square,
  }));
}

/** Six friends, one of them at the 24-character display-name cap. */
const PLAYERS = [
  { id: 'p1', name: 'Bex', joinSeq: 1 },
  { id: 'p2', name: 'Christabella Villanuevas', joinSeq: 2 },
  { id: 'p3', name: 'Sam', joinSeq: 3 },
  { id: 'p4', name: 'Jonno', joinSeq: 4 },
  { id: 'p5', name: 'Priya', joinSeq: 5 },
  { id: 'p6', name: 'Tom', joinSeq: 6 },
];

/** You are the host, so a variant may show the deck-sheet affordance. */
export const MOCK_ROSTER: Roster = {
  code: 'HXQF',
  themeId: 'f1',
  hostPlayerId: 'p1',
  players: PLAYERS,
  you: at(PLAYERS, 0),
};

/** Which of the 24 are marked, and by whom — a mid-race card, one line up. */
const MARKED: [number, string][] = [
  [0, 'p1'],
  [1, 'p3'],
  [2, 'p1'],
  [3, 'p4'],
  [5, 'p2'],
  [7, 'p1'],
  [9, 'p5'],
  [11, 'p3'],
  [14, 'p1'],
  [16, 'p6'],
  [19, 'p2'],
  [21, 'p1'],
];

/** Called before you joined, so grey rather than green — the late-joiner case. */
const INHERITED = new Set([5, 9, 16]);

const ELAPSED = [
  '+2:14',
  '+6:41',
  '+11:03',
  '+17:52',
  '+23:19',
  '+28:47',
  '+34:02',
  '+39:35',
  '+44:58',
  '+51:26',
  '+58:09',
  '+64:33',
];

const nameOf = (id: string) =>
  PLAYERS.find((player) => player.id === id)?.name ?? 'Someone';

export function mockGame(set: LabelSet, stage: Stage = 'mid'): Game {
  const card = cardFor(set);
  const started = stage === 'mid';

  const marks = !started
    ? []
    : MARKED.map(([index, actor], order) => ({
        squareId: at(card, index).id,
        seq: 100 + order,
        actorPlayerId: actor,
      }));

  return {
    id: 'g-proto',
    state: 'live',
    freeCentre: 'LIGHTS OUT',
    card,
    /**
     * The whole 40-square deck, because you are the host — 24 of your card plus
     * 16 that are on nobody's card here, which is what makes ~40% of the timeline
     * read "spotted a square" (see `results.tsx`). A variant that gives the
     * timeline a permanent column has to look right carrying those.
     */
    deck: {
      squares: [
        ...card,
        ...Array.from({ length: 16 }, (_, index) => ({
          id: `proto.v1:deck_only_${index}`,
          label: DECK_ONLY_LABEL[set],
          description: 'A deck square that is on no card in this mock room.',
          tier: index < 5 ? 'certain' : index < 12 ? 'medium' : 'rare',
        })),
      ],
      called: marks.map((mark) => mark.squareId),
    },
    marks,
    inheritedMarks: !started
      ? []
      : MARKED.filter(([index]) => INHERITED.has(index)).map(
          ([index]) => at(card, index).id,
        ),
    prizes: !started
      ? []
      : [
          { seq: 140, prizeKind: 'LINE', playerId: 'p3', name: nameOf('p3') },
          {
            seq: 152,
            prizeKind: 'TWO_LINES',
            playerId: 'p2',
            name: nameOf('p2'),
          },
          {
            seq: 152,
            prizeKind: 'TWO_LINES',
            playerId: 'p5',
            name: nameOf('p5'),
          },
        ],
    standings: !started
      ? PLAYERS.map((player) => ({
          playerId: player.id,
          name: player.name,
          marks: 0,
        }))
      : [
          { playerId: 'p2', name: nameOf('p2'), marks: 14 },
          { playerId: 'p3', name: nameOf('p3'), marks: 13 },
          { playerId: 'p1', name: nameOf('p1'), marks: 12 },
          { playerId: 'p5', name: nameOf('p5'), marks: 11 },
          { playerId: 'p4', name: nameOf('p4'), marks: 9 },
          { playerId: 'p6', name: nameOf('p6'), marks: 7 },
        ],
    /**
     * Twelve rows, a third of them naming a deck-only square this device cannot
     * put prose to. Oldest first — `Results` reverses it.
     */
    timeline: !started
      ? []
      : MARKED.map(([index, actor], order) => ({
          seq: 100 + order,
          squareId:
            order % 3 === 2
              ? `proto.v1:deck_only_${order}`
              : at(card, index).id,
          elapsed: at(ELAPSED, order),
          playerId: actor,
          name: nameOf(actor),
        })),
    streamedThroughSeq: 160,
  };
}

/** The credit toast and D8's undo row, both up at once — the worst bottom slot. */
export function mockBottomSlot(set: LabelSet) {
  const card = mockGame(set).card ?? [];

  return {
    credit: `${nameOf('p2')} spotted ${at(card, 5).label}`,
    undoLabel: at(card, 0).label,
  };
}
