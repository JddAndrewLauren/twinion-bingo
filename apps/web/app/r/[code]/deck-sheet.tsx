import type { Deck } from '../../room-api';

const ROW =
  'flex w-full items-center justify-between gap-2 rounded border p-2 text-left';

/**
 * The other half of D7: the host can call any square in the room's deck, not only
 * the 24 they were dealt, so a square that landed on one card while that player
 * was in the kitchen can still be repaired.
 *
 * It is deliberately not a second card. The card is a 5x5 grid of the squares you
 * are playing; this is an amber-chromed list of the whole deck, so the host is
 * never a beat unsure whether they are playing or hosting.
 *
 * `called` is not this component's state and never becomes it. Like a card's
 * marks it is derived server-side from the call log and arrives with every read
 * of the game, so a call another player makes lands here by the same path as
 * one the host makes — the sheet just renders whatever it was last handed.
 *
 * `finished` closes the sheet's rows for the same reason it closes the card's
 * cells: after D5's full house the API refuses every call. The sheet stays
 * reachable, because reading where the game ended is what it is for.
 */
export function DeckSheet({
  deck,
  onCall,
  finished,
}: {
  deck: Deck;
  onCall: (squareId: string) => void;
  /** Whether the game has reached `done`, after which nothing may be called. */
  finished: boolean;
}) {
  const called = new Set(deck.called);

  return (
    <section
      aria-label="Host deck sheet"
      className="flex flex-col gap-2 rounded border-2 border-amber-500 bg-amber-950 p-3"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300">
        Host deck sheet
      </h2>
      <p className="text-sm text-amber-100">
        Every square in the room&rsquo;s deck, not just the ones on your card.
        Calling one here marks it for everyone holding it.
      </p>
      <p className="text-sm text-amber-100">
        {called.size} of {deck.squares.length} called
      </p>
      <ul className="flex flex-col gap-1">
        {deck.squares.map((square) => {
          const isCalled = called.has(square.id);

          return (
            <li key={square.id}>
              {/*
                A called square stays a row rather than disappearing: the sheet is
                what the host reads to see where the game is up to, and a list
                that shrank as the race went on would answer a different question.
              */}
              <button
                type="button"
                title={square.description}
                aria-pressed={isCalled}
                disabled={finished || isCalled}
                onClick={() => onCall(square.id)}
                className={`${ROW} ${
                  isCalled
                    ? 'border-emerald-400 bg-emerald-800 font-semibold text-emerald-50'
                    : 'border-amber-700 bg-neutral-900'
                }`}
              >
                <span>{square.label}</span>
                <span className="shrink-0 text-xs uppercase">
                  {isCalled ? 'Called' : 'Call'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
