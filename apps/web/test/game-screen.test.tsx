import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomScreen } from '../app/r/[code]/room-screen';
import { FakeEventSource } from './fake-event-source';

const apiUrl = 'https://api.example';
const shareLink = 'https://bingo.example/r/ABCD';

const host = { id: 'host-id', name: 'Ash', joinSeq: 1 };
const guest = { id: 'guest-id', name: 'Bea', joinSeq: 2 };

/** 24 squares is what a card holds; the labels are the assertable part. */
const card = Array.from({ length: 24 }, (_, index) => ({
  id: `f1.v1:t:${index}`,
  label: `Square ${index}`,
  description: `What square ${index} means.`,
  tier: 'medium',
}));

/**
 * A room whose game only exists once it has been started — the same two states
 * the API has, so the screen is exercised across the transition rather than only
 * in its end state.
 */
function stubRoom({
  you,
  liveFromTheStart = false,
}: {
  you: typeof host | null;
  liveFromTheStart?: boolean;
}) {
  const state = { live: liveFromTheStart };

  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/games')) {
      state.live = true;
      return Response.json({ id: 'game-id', state: 'live', freeCentre: 'LIGHTS OUT', card });
    }

    if (url.endsWith('/game')) {
      return state.live
        ? Response.json({ id: 'game-id', state: 'live', freeCentre: 'LIGHTS OUT', card })
        : new Response(null, { status: 404 });
    }

    return Response.json({
      code: 'ABCD',
      themeId: 'f1.v1',
      hostPlayerId: host.id,
      players: [host, guest],
      you,
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.setItem('twinion-bingo:token:ABCD', 'a-token');

  /** The host presses start on their own phone: this browser is not involved. */
  return () => {
    state.live = true;
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('starting a game', () => {
  it('offers the host a start button', async () => {
    stubRoom({ you: host });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(
      await screen.findByRole('button', { name: 'Start game' }),
    ).toBeDefined();
  });

  it('does not offer it to anyone else', async () => {
    stubRoom({ you: guest });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    await screen.findByText(/Ash/);

    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
  });

  it('shows the host their own card once the deal lands', async () => {
    stubRoom({ you: host });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start game' }));

    expect(await screen.findByLabelText('Your card')).toBeDefined();
    expect(screen.getByText('Square 0')).toBeDefined();
  });

  it('says so when the API will not start a game', async () => {
    stubRoom({ you: host });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/games')
          ? new Response(null, { status: 503 })
          : Response.json({
              code: 'ABCD',
              themeId: 'f1.v1',
              hostPlayerId: host.id,
              players: [host],
              you: host,
            }),
      ),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start game' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });
});

/**
 * The criterion that says "every connected player's card renders live": a guest
 * never presses anything, so the only thing that can put a card on their phone is
 * the `GAME_STARTED` row arriving on the stream they were already holding.
 */
describe('a game starting on someone else`s phone', () => {
  it('renders the guest`s card off the stream, with no interaction', async () => {
    const startElsewhere = stubRoom({ you: guest });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByText(/Ash/);

    expect(screen.queryByLabelText('Your card')).toBeNull();

    // The host starts it somewhere else; this browser only sees the log grow.
    startElsewhere();
    const stream = FakeEventSource.opened.at(-1);
    act(() => stream?.emit({ seq: 2, kind: 'GAME_STARTED' }));

    expect(await screen.findByLabelText('Your card')).toBeDefined();
  });
});

describe('the card itself', () => {
  it('is 5x5 with a theme-flavoured free centre', async () => {
    stubRoom({ you: host, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const grid = await screen.findByLabelText('Your card');

    expect(grid.children).toHaveLength(25);
    expect(screen.getByText('LIGHTS OUT')).toBeDefined();
    // The free centre is the thirteenth cell, not an extra one appended.
    expect(grid.children[12]?.textContent).toBe('LIGHTS OUT');
    expect(grid.children[11]?.textContent).toBe('Square 11');
    expect(grid.children[13]?.textContent).toBe('Square 12');
  });

  it('renders every dealt square and marks none of them', async () => {
    stubRoom({ you: host, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const grid = await screen.findByLabelText('Your card');

    for (const square of card) {
      expect(screen.getByText(square.label)).toBeDefined();
    }
    // Marks are derived from the call log, so nothing here is checkable (D4).
    expect(grid.querySelectorAll('input, button')).toHaveLength(0);
  });
});
