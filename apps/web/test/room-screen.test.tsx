import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomScreen } from '../app/r/[code]/room-screen';
import { FakeEventSource } from './fake-event-source';

const apiUrl = 'https://api.example';
const shareLink = 'https://bingo.example/r/ABCD';

const host = { id: 'host-id', name: 'Ash', joinSeq: 1 };
const guest = { id: 'guest-id', name: 'Bea', joinSeq: 2 };

/**
 * A stand-in for the API that behaves the way the room routes do: the roster it
 * returns depends on who has joined, and `you` depends on the token the browser
 * sent — which is the whole point of the reload case below.
 */
function stubApi() {
  const roster = { players: [host] };

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      roster.players = [host, guest];
      return Response.json({ code: 'ABCD', token: 'guest-token', player: guest });
    }

    const token = new Headers(init?.headers).get('authorization');
    const known = token === 'Bearer guest-token';

    return Response.json({
      code: 'ABCD',
      themeId: 'f1.v1',
      hostPlayerId: host.id,
      players: roster.players,
      you: known ? guest : null,
    });
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opening a share link', () => {
  it('prompts for a name when this browser holds no token for the room', async () => {
    stubApi();

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(await screen.findByLabelText('Your name')).toBeDefined();
  });

  it('joins the room and shows the roster', async () => {
    stubApi();

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    fireEvent.change(await screen.findByLabelText('Your name'), {
      target: { value: 'Bea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText(/Bea/)).toBeDefined();
    expect(screen.getByText(/Ash/)).toBeDefined();
  });

  it('keeps the token so a reload comes back as the same player', async () => {
    const fetchMock = stubApi();

    const first = render(
      <RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />,
    );

    fireEvent.change(await screen.findByLabelText('Your name'), {
      target: { value: 'Bea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await screen.findByText(/Bea/);

    expect(window.localStorage.getItem('twinion-bingo:token:ABCD')).toBe(
      'guest-token',
    );

    // The reload: a fresh mount with only localStorage carried over.
    first.unmount();
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    ).length;

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(await screen.findByText(/Bea/)).toBeDefined();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length,
    ).toBe(posts);
  });

  it('sends the stored token when reading the roster', async () => {
    const fetchMock = stubApi();
    window.localStorage.setItem('twinion-bingo:token:ABCD', 'guest-token');

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    // Waiting for the roster to be on screen, not merely for fetch to have been
    // called: the read is only settled once the screen has rendered it, and a
    // test that returns earlier leaves the screen's effects still to run.
    await screen.findByText(/Ash/);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer guest-token',
    );
  });

  it('offers the room for sharing', async () => {
    stubApi();
    window.localStorage.setItem('twinion-bingo:token:ABCD', 'guest-token');

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(
      await screen.findByRole('button', { name: 'Share room' }),
    ).toBeDefined();
  });

  it('says so when no room has that code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ZZZZ" shareLink={shareLink} />);

    expect(await screen.findByText('No room has the code ZZZZ.')).toBeDefined();
  });

  it('treats a code the API rejects as no such room', async () => {
    // ABIO holds the two characters the code alphabet omits, so the API answers 400.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ABIO" shareLink={shareLink} />);

    expect(await screen.findByText('No room has the code ABIO.')).toBeDefined();
  });

  it('says so when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(await screen.findByText('Could not reach the room.')).toBeDefined();
  });
});

/**
 * Sharing is offered from every state where the room resolved, and from none where it
 * did not. The three unresolved states return before the control exists at all, which
 * makes "nothing to share here" structural rather than a condition to keep in step —
 * these cases pin that it stays so.
 */
describe('sharing the room', () => {
  it('offers it to somebody who has not joined yet', async () => {
    stubApi();

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    // The join form, not the lobby: this browser holds no token.
    await screen.findByLabelText('Your name');
    expect(screen.getByRole('button', { name: 'Share room' })).toBeDefined();
  });

  it('offers it from the lobby', async () => {
    stubApi();
    window.localStorage.setItem('twinion-bingo:token:ABCD', 'guest-token');

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    await screen.findByText(/Ash/);
    expect(screen.getByRole('button', { name: 'Share room' })).toBeDefined();
  });

  it('offers nothing while the room is still loading', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(await screen.findByText('Loading room ABCD…')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Share room' })).toBeNull();
  });

  it('offers nothing for a room that does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ZZZZ" shareLink={shareLink} />);

    await screen.findByText('No room has the code ZZZZ.');
    expect(screen.queryByRole('button', { name: 'Share room' })).toBeNull();
  });

  it('offers nothing for a code the API rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ABIO" shareLink={shareLink} />);

    await screen.findByText('No room has the code ABIO.');
    expect(screen.queryByRole('button', { name: 'Share room' })).toBeNull();
  });

  it('offers nothing when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    await screen.findByText('Could not reach the room.');
    expect(screen.queryByRole('button', { name: 'Share room' })).toBeNull();
  });
});

describe('the live roster', () => {
  /** A room whose roster is whatever `players` holds when it is read. */
  function stubRoom(players: { id: string; name: string; joinSeq: number }[]) {
    window.localStorage.setItem('twinion-bingo:token:ABCD', 'host-token');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          code: 'ABCD',
          themeId: 'f1.v1',
          hostPlayerId: host.id,
          players: [...players],
          you: host,
        }),
      ),
    );
  }

  /**
   * The stream opens on `load === 'ready' && gameLoaded`, so waiting for a name
   * to appear waits for the roster only — the game read has still to settle.
   * Waiting for the stream itself is what these cases actually mean.
   */
  function openedStream() {
    return waitFor(() => {
      const opened = FakeEventSource.opened.at(-1);
      expect(opened).toBeDefined();
      return opened!;
    });
  }

  it('adds a player who joined on another browser, with no refresh', async () => {
    const players = [host];
    stubRoom(players);

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    const stream = await openedStream();
    expect(stream.url).toBe('https://api.example/rooms/ABCD/stream');

    // The second phone joins: the log grows, and the stream says so.
    players.push(guest);
    act(() => stream.emit({ seq: 2, kind: 'PLAYER_JOINED' }));

    expect(await screen.findByText(/Bea/)).toBeDefined();
  });

  it('closes the stream when the screen goes away', async () => {
    stubRoom([host]);

    const view = render(
      <RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />,
    );

    const stream = await openedStream();
    view.unmount();

    expect(stream.closed).toBe(true);
  });
});
