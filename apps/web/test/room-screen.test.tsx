import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomScreen } from '../app/r/[code]/room-screen';

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

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer guest-token',
    );
  });

  it('shows the share link for the room', async () => {
    stubApi();
    window.localStorage.setItem('twinion-bingo:token:ABCD', 'guest-token');

    render(<RoomScreen apiUrl={apiUrl} code="ABCD" shareLink={shareLink} />);

    expect(
      await screen.findByText(`Share this link: ${shareLink}`),
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
