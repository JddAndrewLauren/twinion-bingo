import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  marks = [],
  streamedThroughSeq = 2,
}: {
  you: typeof host | null;
  liveFromTheStart?: boolean;
  /** What the server's derivation already says is marked when this phone arrives. */
  marks?: string[];
  /** How far down the log those marks account for — the toast's replay horizon. */
  streamedThroughSeq?: number;
}) {
  const state = { live: liveFromTheStart, marks: [...marks] };

  const view = () => ({
    id: 'game-id',
    state: 'live',
    freeCentre: 'LIGHTS OUT',
    card,
    marks: [...state.marks],
    streamedThroughSeq,
  });

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    // The API derives marks from the call log rather than storing them, so the
    // stub does the same: a call appends, and the next read of the game is what
    // puts the mark on screen.
    if (url.endsWith('/call')) {
      const body = JSON.parse(init!.body as string) as { square_id: string };
      if (!state.marks.includes(body.square_id)) state.marks.push(body.square_id);

      return Response.json(
        { seq: 9, squareId: body.square_id, actorPlayerId: you?.id, appended: true },
        { status: 201 },
      );
    }

    if (url.endsWith('/games')) {
      state.live = true;
      return Response.json(view());
    }

    if (url.endsWith('/game')) {
      return state.live ? Response.json(view()) : new Response(null, { status: 404 });
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

  return {
    fetchMock,
    /** The host presses start on their own phone: this browser is not involved. */
    startElsewhere: () => {
      state.live = true;
    },
    /** Somebody else's tap reaching the log, which the stream then announces. */
    calledElsewhere: (squareId: string) => {
      if (!state.marks.includes(squareId)) state.marks.push(squareId);
    },
  };
}

/** The stream this browser opened, which is where every other phone's news arrives. */
function stream() {
  const opened = FakeEventSource.opened.at(-1);
  expect(opened).toBeDefined();

  return opened!;
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
    const room = stubRoom({ you: guest });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByText(/Ash/);

    expect(screen.queryByLabelText('Your card')).toBeNull();

    // The host starts it somewhere else; this browser only sees the log grow.
    room.startElsewhere();
    act(() => stream().emit({ seq: 3, kind: 'GAME_STARTED' }));

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

  it('renders every dealt square as something you can call', async () => {
    stubRoom({ you: host, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const grid = await screen.findByLabelText('Your card');

    for (const square of card) {
      expect(screen.getByText(square.label)).toBeDefined();
    }

    // 24 earnable squares are tappable; the free centre is not one of them.
    const buttons = grid.querySelectorAll('button');
    expect(buttons).toHaveLength(24);
    // Nothing is checkable state: a mark is what the server derived, and with an
    // empty call log nothing is pressed.
    expect(grid.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    expect(grid.querySelectorAll('input')).toHaveLength(0);
  });

  it('shows the marks the server derived, and does not offer to call them again', async () => {
    stubRoom({ you: host, liveFromTheStart: true, marks: ['f1.v1:t:3'] });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const grid = await screen.findByLabelText('Your card');
    const marked = grid.querySelectorAll('[aria-pressed="true"]');

    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toBe('Square 3');
    expect((marked[0] as HTMLButtonElement).disabled).toBe(true);
  });
});

/**
 * D1's two halves: the tap that calls an event for everyone holding it, and the
 * credit that comes back on every device.
 */
describe('calling a square', () => {
  it('posts the square you tapped, and marks it once the server says so', async () => {
    const room = stubRoom({ you: host, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const square = await screen.findByRole('button', { name: 'Square 5' });
    expect(square.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(square);

    const call = await waitFor(() => {
      const posted = room.fetchMock.mock.calls.find(([url]) =>
        (url as string).endsWith('/call'),
      );
      expect(posted).toBeDefined();

      return posted!;
    });

    expect(call[0]).toBe('https://api.example/games/game-id/call');
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      square_id: 'f1.v1:t:5',
    });

    // Not marked because this browser said so — marked because the re-read of the
    // game, which is the same read every other phone takes, now says it is.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Square 5' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('says so when the call does not land', async () => {
    stubRoom({ you: host, liveFromTheStart: true });
    const passthrough = globalThis.fetch as typeof fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        url.endsWith('/call')
          ? new Response(null, { status: 403 })
          : passthrough(url, init),
      ),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Square 5' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  /**
   * The criterion that says a toast credits the caller on every device: this
   * browser never taps anything, so the only thing that can put a mark and a
   * credit on it is the CALL row arriving on the stream it was already holding.
   */
  it('credits the spotter by name when someone else calls a square you hold', async () => {
    const room = stubRoom({ you: host, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');

    room.calledElsewhere('f1.v1:t:7');
    act(() =>
      stream().emit({
        seq: 12,
        kind: 'CALL',
        actorPlayerId: guest.id,
        squareId: 'f1.v1:t:7',
      }),
    );

    expect((await screen.findByRole('status')).textContent).toBe(
      'Bea spotted Square 7',
    );

    // The mark follows a beat later: the frame prompts a re-read of the game, and
    // the re-read is what says the square is marked.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Square 7' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  /**
   * A square this player does not hold still credits its spotter, but cannot name
   * itself: a device only ever knows the prose for its own 24 squares, and the
   * rest of the deck is the host's sheet.
   */
  it('credits a call for a square that is not on this card, without naming it', async () => {
    stubRoom({ you: host, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');

    act(() =>
      stream().emit({
        seq: 12,
        kind: 'CALL',
        actorPlayerId: guest.id,
        squareId: 'f1.v1:t:999',
      }),
    );

    expect((await screen.findByRole('status')).textContent).toBe(
      'Bea spotted a square',
    );
  });

  /**
   * Reconnect correctness. A first connection sends no `Last-Event-ID`, so the
   * room's whole log replays at once — and a device arriving mid-race must land on
   * the state everyone else is looking at, not on a stack of toasts announcing
   * calls that happened an hour ago.
   */
  it('does not re-announce calls its snapshot already accounts for', async () => {
    stubRoom({
      you: host,
      liveFromTheStart: true,
      marks: ['f1.v1:t:7'],
      streamedThroughSeq: 12,
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    // Arrived already marked, which is what a device that never dropped shows.
    expect(
      (await screen.findByRole('button', { name: 'Square 7' })).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');

    // The replay of that very call, at or below the snapshot's horizon.
    act(() =>
      stream().emit({
        seq: 12,
        kind: 'CALL',
        actorPlayerId: guest.id,
        squareId: 'f1.v1:t:7',
      }),
    );

    expect(screen.queryByRole('status')).toBeNull();
  });
});
