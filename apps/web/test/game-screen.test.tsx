import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrizeAward, TimelineEntry } from '../app/room-api';
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

type Mark = { squareId: string; seq: number; actorPlayerId: string };

/** The seq the stub hands the next appended call — a real log never reuses one. */
let nextSeq = 100;

/**
 * The room's 40-square deck. Its first 24 are the card above, so the last 16 are
 * squares nobody but the host can call — which is the whole point of the sheet.
 */
const deckSquares = [
  ...card,
  ...Array.from({ length: 16 }, (_, index) => ({
    id: `f1.v1:t:${24 + index}`,
    label: `Square ${24 + index}`,
    description: `What square ${24 + index} means.`,
    tier: 'medium',
  })),
];

/**
 * A room whose game only exists once it has been started — the same two states
 * the API has, so the screen is exercised across the transition rather than only
 * in its end state.
 */
function stubRoom({
  you,
  liveFromTheStart = false,
  marks = [],
  inheritedMarks = [],
  prizes = [],
  timeline = [],
  gameState = 'live',
  streamedThroughSeq = 2,
  deck = false,
}: {
  you: typeof host | null;
  liveFromTheStart?: boolean;
  /** What the server's derivation already says is marked when this phone arrives. */
  marks?: Mark[];
  /** The square ids among those called before this player joined — greyed. */
  inheritedMarks?: string[];
  prizes?: PrizeAward[];
  timeline?: TimelineEntry[];
  gameState?: string;
  /** How far down the log those marks account for — the toast's replay horizon. */
  streamedThroughSeq?: number;
  /**
   * Whether the API hands this browser a deck. Only the host is given one, so the
   * stub decides it the way the server does rather than leaving the screen to
   * work it out from the roster.
   */
  deck?: boolean;
}) {
  const state = { live: liveFromTheStart, marks: [...marks] };

  const view = () => ({
    id: 'game-id',
    state: gameState,
    freeCentre: 'LIGHTS OUT',
    card,
    deck: deck
      ? {
          squares: deckSquares,
          // The same derivation the marks are, taken against the deck rather
          // than against a card.
          called: deckSquares
            .map((square) => square.id)
            .filter((id) => state.marks.some((mark) => mark.squareId === id)),
        }
      : null,
    marks: [...state.marks],
    inheritedMarks,
    prizes,
    // Raw mark count, which is what the API derives; the stub keeps it in step.
    standings: [
      { playerId: host.id, name: host.name, marks: state.marks.length },
      { playerId: guest.id, name: guest.name, marks: 0 },
    ],
    timeline,
    streamedThroughSeq,
  });

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    // The API derives marks from the call log rather than storing them, so the
    // stub does the same: a call appends, and the next read of the game is what
    // puts the mark on screen.
    if (url.endsWith('/call')) {
      const body = JSON.parse(init!.body as string) as { square_id: string };
      const called = {
        squareId: body.square_id,
        seq: (nextSeq += 1),
        actorPlayerId: you!.id,
      };
      if (!state.marks.some((mark) => mark.squareId === called.squareId)) {
        state.marks.push(called);
      }

      return Response.json({ ...called, appended: true }, { status: 201 });
    }

    // A RETRACT supersedes the CALL it names and the derivation stops returning
    // it, which is the only thing that unmarks a square — here as in the API.
    if (url.endsWith('/retract')) {
      const body = JSON.parse(init!.body as string) as { seq: number };
      state.marks = state.marks.filter((mark) => mark.seq !== body.seq);

      return Response.json(
        { targetSeq: body.seq, appended: true },
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
    calledElsewhere: (squareId: string, by: string = guest.id) => {
      if (!state.marks.some((mark) => mark.squareId === squareId)) {
        state.marks.push({ squareId, seq: (nextSeq += 1), actorPlayerId: by });
      }
    },
    /** Somebody else taking a call back, which the stream then announces. */
    retractedElsewhere: (seq: number) => {
      state.marks = state.marks.filter((mark) => mark.seq !== seq);
    },
    /**
     * The row the log holds for a square — the seq a test needs when it wants to
     * replay this browser's own CALL back at it, the way the stream really does.
     */
    markFor: (squareId: string) =>
      state.marks.find((mark) => mark.squareId === squareId),
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
    // A guest looking at someone else's call: a bystander with nothing to correct,
    // so the marked cell is inert rather than a second chance to call it.
    stubRoom({
      you: guest,
      liveFromTheStart: true,
      marks: [{ squareId: 'f1.v1:t:3', seq: 7, actorPlayerId: host.id }],
    });

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
      marks: [{ squareId: 'f1.v1:t:7', seq: 12, actorPlayerId: guest.id }],
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

/** The other half of D7: the host calls from the deck, not only from their card. */
describe('the host deck sheet', () => {
  /** Opens the sheet from the card, which is where the host always starts. */
  async function openSheet() {
    fireEvent.click(await screen.findByRole('button', { name: 'Host deck sheet' }));

    return screen.findByLabelText('Host deck sheet');
  }

  it('is reachable from the host`s card and lists the whole deck', async () => {
    stubRoom({ you: host, liveFromTheStart: true, deck: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');

    const sheet = await openSheet();

    // Every deck square, including the 16 that are on no card of the host's.
    expect(sheet.querySelectorAll('li')).toHaveLength(40);
    expect(within(sheet).getByText('Square 39')).toBeDefined();
    expect(within(sheet).getByText('0 of 40 called')).toBeDefined();
  });

  /**
   * The separation the criterion asks for: the host is never a beat unsure
   * whether they are playing their card or acting as host, because only one of
   * the two is on screen and the sheet says which it is.
   */
  it('is a surface of its own rather than a second card', async () => {
    stubRoom({ you: host, liveFromTheStart: true, deck: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');
    await openSheet();

    expect(screen.queryByLabelText('Your card')).toBeNull();
    // And back again, without a reload.
    fireEvent.click(screen.getByRole('button', { name: 'Back to your card' }));
    expect(await screen.findByLabelText('Your card')).toBeDefined();
    expect(screen.queryByLabelText('Host deck sheet')).toBeNull();
  });

  it('is not offered to a player the API handed no deck', async () => {
    stubRoom({ you: guest, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');

    expect(screen.queryByRole('button', { name: 'Host deck sheet' })).toBeNull();
    expect(screen.queryByLabelText('Host deck sheet')).toBeNull();
  });

  it('calls a deck square that is on no card of the host`s, by the same request', async () => {
    const room = stubRoom({ you: host, liveFromTheStart: true, deck: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');
    const sheet = await openSheet();

    fireEvent.click(within(sheet).getByText('Square 30'));

    const posted = await waitFor(() => {
      const found = room.fetchMock.mock.calls.find(([url]) =>
        (url as string).endsWith('/call'),
      );
      expect(found).toBeDefined();

      return found!;
    });

    // The same endpoint and the same body a tap on the card sends — one call
    // path, so nothing downstream can tell a sheet call from a card call.
    expect(posted[0]).toBe('https://api.example/games/game-id/call');
    expect(JSON.parse((posted[1] as RequestInit).body as string)).toEqual({
      square_id: 'f1.v1:t:30',
    });

    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Host deck sheet'))
          .getByRole('button', { name: /Square 30/ })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('shows a square that arrived already called, and does not offer to call it again', async () => {
    stubRoom({
      you: host,
      liveFromTheStart: true,
      deck: true,
      marks: [{ squareId: 'f1.v1:t:3', seq: 7, actorPlayerId: guest.id }],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');
    const sheet = await openSheet();

    const called = sheet.querySelectorAll('[aria-pressed="true"]');
    expect(called).toHaveLength(1);
    expect((called[0] as HTMLButtonElement).disabled).toBe(true);
    expect(within(sheet).getByText('1 of 40 called')).toBeDefined();
  });

  /**
   * The sheet updates live as calls arrive from players — by the same path the
   * card does, because both render whatever the last read of the game handed
   * them and the stream is what prompts that read.
   */
  it('updates as a call arrives from another player', async () => {
    const room = stubRoom({ you: host, liveFromTheStart: true, deck: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);
    await screen.findByLabelText('Your card');
    await openSheet();

    room.calledElsewhere('f1.v1:t:33');
    act(() =>
      stream().emit({
        seq: 12,
        kind: 'CALL',
        actorPlayerId: guest.id,
        squareId: 'f1.v1:t:33',
      }),
    );

    // Named, because the host is the one device that holds the deck's prose.
    expect((await screen.findByRole('status')).textContent).toBe(
      'Bea spotted Square 33',
    );

    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Host deck sheet'))
          .getByRole('button', { name: /Square 33/ })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });
});

/**
 * D8's graduated friction. The same correction — an appended RETRACT naming the
 * CALL — reached three ways, and what differs is only what it cost to reach it.
 */
describe('taking a call back', () => {
  /** The `/retract` body this browser posted, or undefined if it posted none. */
  function retracted(fetchMock: ReturnType<typeof vi.fn>) {
    const posted = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith('/retract'),
    );

    return posted === undefined
      ? undefined
      : (JSON.parse((posted[1] as RequestInit).body as string) as { seq: number });
  }

  /**
   * The reflex case. A misread during a restart is the common way a call goes
   * wrong, and a modal in that moment is exactly the wrong thing — so inside the
   * window the correction is one tap and asks nothing.
   */
  it('offers your own call back for one tap, with nothing to confirm', async () => {
    const room = stubRoom({ you: guest, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Square 5' }));

    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('Called Square 5');
    // Nothing stands between the toast and the correction.
    expect(screen.queryByRole('dialog')).toBeNull();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Square 5' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // Still no confirmation, and the square unmarks by the same re-read that
    // marked it — there was never a local mark to undo locally.
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(retracted(room.fetchMock)).toBeDefined());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Square 5' }).getAttribute('aria-pressed'),
      ).toBe('false'),
    );
  });

  /**
   * The window shutting, and the second path opening. Past ten seconds a wrong
   * call is no longer a reflex, so the same correction costs a confirmation —
   * reached by tapping the square rather than by a toast that is long gone.
   */
  it('replaces the one-tap undo with a confirmation once the window closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      const room = stubRoom({ you: guest, liveFromTheStart: true });

      render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Square 5' }));
      await screen.findByRole('button', { name: 'Undo' });

      /**
       * The button being in the DOM only means React committed the render. The
       * effect that schedules the window's expiry is a *passive* effect, which
       * flushes after that commit — so advancing the clock the moment the button
       * appears can advance past a timer that has not been scheduled yet, and the
       * window would then never close. Flush first, then advance, then wait.
       */
      await act(async () => {});

      /**
       * Nine seconds in, the window is still open. Without this the test would
       * pass for any window at all — a regression shortening it to a tenth of a
       * second would still end with the Undo gone, and criterion 1 is the one
       * criterion that names a duration.
       */
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_000);
      });
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();

      // And past ten, it is shut.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });

      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull(),
      );

      // The square is marked and still this player's to correct, so it is not
      // inert — it asks first.
      fireEvent.click(screen.getByRole('button', { name: 'Square 5' }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).toContain('Square 5');
      expect(retracted(room.fetchMock)).toBeUndefined();

      fireEvent.click(screen.getByRole('button', { name: 'Take it back' }));

      await waitFor(() => expect(retracted(room.fetchMock)).toBeDefined());
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Square 5' }).getAttribute('aria-pressed'),
        ).toBe('false'),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The bottom slot is shared, and sharing it must not cost #8's criterion that a
   * call is credited by name on every device. A credit's four seconds run whether
   * or not it is on screen, so a hidden one is a dropped one — and a restart, the
   * very thing the undo window exists for, is several spotters in a few seconds.
   */
  it('still credits another spotter while your own undo window is open', async () => {
    const room = stubRoom({ you: guest, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Square 5' }));
    await screen.findByRole('button', { name: 'Undo' });

    room.calledElsewhere('f1.v1:t:7', host.id);
    act(() =>
      stream().emit({
        seq: 5000,
        kind: 'CALL',
        actorPlayerId: host.id,
        squareId: 'f1.v1:t:7',
      }),
    );

    // The credit is not swallowed by the undo row...
    expect(await screen.findByText('Ash spotted Square 7')).toBeDefined();
    // ...and the credit does not cut the window short either.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
  });

  /**
   * The one credit that is a duplicate rather than news: your own call comes back
   * on the stream like everyone else's, and the undo row one line below is already
   * naming it.
   */
  it('does not credit your own call underneath the undo row naming it', async () => {
    const room = stubRoom({ you: guest, liveFromTheStart: true });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Square 5' }));
    await screen.findByRole('button', { name: 'Undo' });

    const mine = room.markFor('f1.v1:t:5');
    expect(mine).toBeDefined();

    act(() =>
      stream().emit({
        seq: mine!.seq,
        kind: 'CALL',
        actorPlayerId: guest.id,
        squareId: 'f1.v1:t:5',
      }),
    );

    expect(screen.queryByText('Bea spotted Square 5')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
  });

  it('leaves the call alone when the confirmation is declined', async () => {
    const room = stubRoom({
      you: host,
      liveFromTheStart: true,
      marks: [{ squareId: 'f1.v1:t:3', seq: 7, actorPlayerId: guest.id }],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Square 3' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(retracted(room.fetchMock)).toBeUndefined();
    expect(
      screen.getByRole('button', { name: 'Square 3' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  /**
   * D8's third path. Players may only take back their own calls, or a correction
   * would be an argument; the host may take back anyone's, so a call whose caller
   * has put their phone down is still fixable.
   */
  it('lets the host take back a call somebody else made', async () => {
    const room = stubRoom({
      you: host,
      liveFromTheStart: true,
      marks: [{ squareId: 'f1.v1:t:3', seq: 7, actorPlayerId: guest.id }],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Square 3' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Take it back' }));

    await waitFor(() => expect(retracted(room.fetchMock)?.seq).toBe(7));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Square 3' }).getAttribute('aria-pressed'),
      ).toBe('false'),
    );
  });

  /**
   * The fanout criterion, from the side of a device that did nothing. A RETRACT
   * arriving on the stream unmarks the square here by the same re-read that
   * marked it, with no local bookkeeping to keep in step.
   */
  it('unmarks a square when someone else`s retraction arrives on the stream', async () => {
    const room = stubRoom({
      you: guest,
      liveFromTheStart: true,
      marks: [{ squareId: 'f1.v1:t:7', seq: 12, actorPlayerId: host.id }],
      streamedThroughSeq: 12,
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(
      (await screen.findByRole('button', { name: 'Square 7' })).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');

    room.retractedElsewhere(12);
    act(() =>
      stream().emit({ seq: 13, kind: 'RETRACT', actorPlayerId: host.id }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Square 7' }).getAttribute('aria-pressed'),
      ).toBe('false'),
    );
  });
});

/** A mark as the API derives it: the square, and the CALL row that marked it. */
const markOf = (index: number, seq: number, by = guest.id) => ({
  squareId: `f1.v1:t:${index}`,
  seq,
  actorPlayerId: by,
});

/**
 * The log-derived views: the ladder, the standings and the timeline. All three
 * arrive with every read of the game, so nothing here is state the screen has to
 * keep in step — which is the same reason a reconnect needs no catch-up path.
 */
describe('prizes, standings and the timeline', () => {
  const prizes = [
    { seq: 20, prizeKind: 'LINE', playerId: guest.id, name: 'Bea' },
    { seq: 31, prizeKind: 'TWO_LINES', playerId: host.id, name: 'Ash' },
  ];

  it('names each rung of the ladder and who won it, in order', async () => {
    stubRoom({ you: host, liveFromTheStart: true, prizes });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const list = (await screen.findByText('Prizes')).parentElement!;
    expect(
      [...list.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['first line — Bea', 'two lines — Ash']);
  });

  it('ranks the room by raw mark count', async () => {
    stubRoom({
      you: host,
      liveFromTheStart: true,
      marks: [markOf(1, 101), markOf(2, 102)],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const list = (await screen.findByText('Standings')).parentElement!;
    expect(
      [...list.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['Ash2', 'Bea0']);
  });

  it('calls the standings final once the full house has closed the game', async () => {
    stubRoom({ you: host, liveFromTheStart: true, gameState: 'done' });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(await screen.findByText('Final standings')).toBeDefined();
  });

  /**
   * Elapsed game time, not lap numbers, and newest first — what just happened is
   * what a phone held at arm's length needs to see without scrolling.
   */
  it('stamps every call with elapsed time and credits its spotter', async () => {
    stubRoom({
      you: host,
      liveFromTheStart: true,
      timeline: [
        { seq: 8, squareId: 'f1.v1:t:3', elapsed: '+04:02', playerId: host.id, name: 'Ash' },
        { seq: 14, squareId: 'f1.v1:t:9', elapsed: '+42:10', playerId: guest.id, name: 'Bea' },
      ],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const list = (await screen.findByText('Timeline')).parentElement!;
    expect(
      [...list.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['+42:10Bea spotted Square 9', '+04:02Ash spotted Square 3']);
  });

  /**
   * Not a secrecy measure — the stream already ships `squareId` to every device.
   * This is consistency with the spotter toast, and not shipping the whole deck
   * to a client that holds 24 of it.
   */
  it('does not name a called square whose prose this device was not given', async () => {
    stubRoom({
      you: host,
      liveFromTheStart: true,
      timeline: [
        { seq: 8, squareId: 'f1.v1:t:999', elapsed: '+11:00', playerId: guest.id, name: 'Bea' },
      ],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const list = (await screen.findByText('Timeline')).parentElement!;
    expect(
      [...list.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['+11:00Bea spotted a square']);
  });
});

/**
 * The greyed-line rule. A late joiner's card is correct for free — the same
 * derivation everyone else's runs — but the marks it walked in on claim nothing,
 * and the card has to say so before the prize goes elsewhere rather than after.
 */
describe('a late joiner`s card', () => {
  it('greys the marks that were already there when they arrived', async () => {
    stubRoom({
      you: guest,
      liveFromTheStart: true,
      marks: [markOf(0, 101, host.id), markOf(1, 102, host.id), markOf(5, 103, guest.id)],
      inheritedMarks: ['f1.v1:t:0', 'f1.v1:t:1'],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const grid = await screen.findByLabelText('Your card');

    // All three read as marked; only the two they walked in on are greyed.
    expect(grid.querySelectorAll('[aria-pressed="true"]')).toHaveLength(3);

    const greyed = [...grid.querySelectorAll('[data-inherited="true"]')];
    expect(greyed.map((cell) => cell.textContent)).toEqual([
      'Square 0',
      'Square 1',
    ]);
    // Greyed, not green — the earned one keeps the emerald the room reads as a win.
    expect(greyed.every((cell) => cell.className.includes('emerald'))).toBe(false);
    expect(
      screen
        .getByRole('button', { name: 'Square 5' })
        .className.includes('emerald'),
    ).toBe(true);
  });

  /**
   * Greying is about who may win with a mark, not who may correct it. D8's
   * retract paths compose with it rather than being overridden by it.
   */
  it('still lets the caller take back an inherited call of their own', async () => {
    stubRoom({
      you: guest,
      liveFromTheStart: true,
      marks: [markOf(0, 101, guest.id)],
      inheritedMarks: ['f1.v1:t:0'],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const cell = await screen.findByRole('button', { name: 'Square 0' });
    expect(cell.getAttribute('data-inherited')).toBe('true');
    expect((cell as HTMLButtonElement).disabled).toBe(false);
  });

  it('leaves an all-green card for someone who was here at lights out', async () => {
    stubRoom({
      you: host,
      liveFromTheStart: true,
      marks: [markOf(0, 101, host.id)],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const grid = await screen.findByLabelText('Your card');
    expect(grid.querySelectorAll('[data-inherited="true"]')).toHaveLength(0);
  });
});

/**
 * The disconnect criterion, on the client side of it. A first connection sends
 * no `Last-Event-ID`, so the room's whole log replays at once — and prizes,
 * standings and the timeline have to come back identical rather than
 * accumulating a second copy of everything they already showed.
 */
describe('a replayed log', () => {
  it('leaves the prizes, standings and timeline exactly as they were', async () => {
    stubRoom({
      you: host,
      liveFromTheStart: true,
      marks: [markOf(7, 12)],
      streamedThroughSeq: 12,
      prizes: [{ seq: 11, prizeKind: 'LINE', playerId: guest.id, name: 'Bea' }],
      timeline: [
        { seq: 12, squareId: 'f1.v1:t:7', elapsed: '+42:10', playerId: guest.id, name: 'Bea' },
      ],
    });

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const read = async () => {
      const panel = (await screen.findByText('Timeline')).parentElement!.parentElement!;

      return [...panel.querySelectorAll('li')].map((item) => item.textContent);
    };

    const before = await read();
    expect(before).toEqual([
      'first line — Bea',
      'Ash1',
      'Bea0',
      '+42:10Bea spotted Square 7',
    ]);

    // The replay of the very call the snapshot already accounts for.
    act(() =>
      stream().emit({
        seq: 12,
        kind: 'CALL',
        actorPlayerId: guest.id,
        squareId: 'f1.v1:t:7',
      }),
    );

    await waitFor(async () => expect(await read()).toEqual(before));
  });
});
