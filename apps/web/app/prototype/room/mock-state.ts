/**
 * PROTOTYPE — mock state for #12. Delete with the rest of this folder.
 *
 * Shaped as the real `Game` and `Roster` so the variants can hand pieces of it to
 * the real `Results`, and so nothing here has to be re-learned when a decision
 * folds into #13/#14. No API, no token, no stream: the question this prototype
 * answers is about layout, and mock state is the point rather than a shortcut.
 *
 * Two label sets, because the issue asks for a decision about the <=30 char cap
 * (D4) and one set cannot settle it:
 *
 * - `real` — the committed 47-square pool's own longest labels. Longest single
 *   word 10 characters, which per docs/SURFACES.md is *exactly* the width an iPad
 *   cell fits. This is what is on screen today.
 * - `cap`  — plausible labels at the cap whose long words are 11-13 characters:
 *   `investigation`, `championship`, `disqualified`, `reprimanded`. Ordinary
 *   motorsport vocabulary that #16 will author, and the case #47 says overflows.
 *
 * Judge every variant against `cap`. `real` is the control.
 */

import type { CardSquare, Game, Roster } from '../../room-api';

export type LabelSet = 'cap' | 'real';

/** The committed pool's longest labels — longest word 10 (`Verstappen`). */
const REAL_LABELS: [string, string][] = [
  ['Verstappen moans at Red Bull', 'medium'],
  ['Hamilton moans at Ferrari', 'medium'],
  ['Hulkenberg moans at Audi', 'certain'],
  ['Leclerc moans at Ferrari', 'medium'],
  ['Piastri moans at McLaren', 'medium'],
  ['Hulkenberg on the podium', 'rare'],
  ['Verstappen on the podium', 'certain'],
  ['Hadjar moans at Red Bull', 'medium'],
  ['Albon moans at Williams', 'medium'],
  ['Bortoleto moans at Audi', 'certain'],
  ['Norris moans at McLaren', 'medium'],
  ['Sainz moans at Williams', 'medium'],
  ['Bortoleto on the podium', 'rare'],
  ['Red Bull fumbles a stop', 'medium'],
  ['Safety car before lap 10', 'medium'],
  ['Ferrari fumbles a stop', 'medium'],
  ['Norris on the podium', 'certain'],
  ['Rain in the final stint', 'rare'],
  ['A driver retires the car', 'certain'],
  ['Piastri leads a lap', 'medium'],
  ['Two cars touch at turn 1', 'certain'],
  ['Leclerc sets fastest lap', 'medium'],
  ['A pit lane start', 'rare'],
  ['Hamilton passes on track', 'medium'],
];

/**
 * The cap's worst plausible case: 28-30 characters *and* a word of 11-13. Every
 * long word here is real motorsport vocabulary a commentator says once a race, so
 * a variant that cannot render these is a variant that constrains #16's authoring.
 */
const CAP_LABELS: [string, string][] = [
  ['Verstappen investigation', 'medium'],
  ['Stewards open investigation', 'certain'],
  ['A driver is disqualified', 'rare'],
  ['Hulkenberg is reprimanded', 'medium'],
  ['Championship lead changes', 'rare'],
  ['Championship maths on air', 'certain'],
  ['Post-race investigation', 'medium'],
  ['Leclerc is reprimanded', 'medium'],
  ['Grid penalty for a Red Bull', 'medium'],
  ['Unsafe release investigation', 'rare'],
  ['Verstappen moans at Red Bull', 'medium'],
  ['Hulkenberg moans at Audi', 'certain'],
  ['Bortoleto on the podium', 'rare'],
  ['Track limits investigation', 'certain'],
  ['A reprimanded driver moans', 'medium'],
  ['Safety car before lap 10', 'medium'],
  ['Red Bull fumbles a stop', 'medium'],
  ['Disqualified from the grid', 'rare'],
  ['Championship rival retires', 'medium'],
  ['Two cars touch at turn 1', 'certain'],
  ['Rain in the final stint', 'rare'],
  ['Hamilton passes on track', 'medium'],
  ['Leclerc sets fastest lap', 'medium'],
  ['A pit lane start', 'certain'],
];

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
  const labels = set === 'cap' ? CAP_LABELS : REAL_LABELS;

  return labels.map(([label, tier], index) => ({
    id: `proto.v1:square_${index}`,
    label,
    description: `${label} — the long-press prose, which on the real card is a title attribute and not a layout concern.`,
    tier,
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

export function mockGame(set: LabelSet): Game {
  const card = cardFor(set);

  const marks = MARKED.map(([index, actor], order) => ({
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
          label:
            set === 'cap'
              ? 'Championship investigation'.slice(0, 30)
              : 'Antonelli moans at Mercedes'.slice(0, 30),
          description: 'A deck square that is on no card in this mock room.',
          tier: index < 5 ? 'certain' : index < 12 ? 'medium' : 'rare',
        })),
      ],
      called: marks.map((mark) => mark.squareId),
    },
    marks,
    inheritedMarks: MARKED.filter(([index]) => INHERITED.has(index)).map(
      ([index]) => at(card, index).id,
    ),
    prizes: [
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
    standings: [
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
    timeline: MARKED.map(([index, actor], order) => ({
      seq: 100 + order,
      squareId:
        order % 3 === 2 ? `proto.v1:deck_only_${order}` : at(card, index).id,
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
