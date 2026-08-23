import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomList } from '../app/admin/room-list';

const apiUrl = 'https://api.example';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function unlockJson(rooms: unknown[]) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    if (headers.authorization !== 'Bearer lax-paddock') {
      return new Response(null, { status: 401 });
    }
    return Response.json({ rooms });
  });
}

describe('the admin room list, locked', () => {
  it('shows a secret form and no room data', () => {
    render(<RoomList apiUrl={apiUrl} />);

    expect(screen.getByLabelText('Admin secret')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says so, generically, for the wrong secret — and still shows no room data', async () => {
    vi.stubGlobal('fetch', unlockJson([{ code: 'ABCD', themeId: 'f1.v2', playerCount: 1, gameState: 'lobby', ageSeconds: 5 }]));

    render(<RoomList apiUrl={apiUrl} />);
    fireEvent.change(screen.getByLabelText('Admin secret'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Wrong secret.');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('ABCD')).toBeNull();
  });
});

describe('the admin room list, unlocked', () => {
  it('lists code, theme, player count, game state and age for the right secret', async () => {
    vi.stubGlobal(
      'fetch',
      unlockJson([
        { code: 'ABCD', themeId: 'f1.v2', playerCount: 3, gameState: 'live', ageSeconds: 125 },
      ]),
    );

    render(<RoomList apiUrl={apiUrl} />);
    fireEvent.change(screen.getByLabelText('Admin secret'), { target: { value: 'lax-paddock' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(screen.getByText('ABCD')).toBeDefined());
    expect(screen.getByText('Formula 1')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('live')).toBeDefined();
    expect(screen.getByText('2m')).toBeDefined();
  });

  it('refreshes on its own, without the operator doing anything', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          rooms: [{ code: 'ABCD', themeId: 'f1.v2', playerCount: 1, gameState: 'lobby', ageSeconds: 5 }],
        }),
      )
      .mockResolvedValue(
        Response.json({
          rooms: [{ code: 'ABCD', themeId: 'f1.v2', playerCount: 4, gameState: 'live', ageSeconds: 65 }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<RoomList apiUrl={apiUrl} />);
    fireEvent.change(screen.getByLabelText('Admin secret'), { target: { value: 'lax-paddock' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await vi.waitFor(() => expect(screen.getByText('lobby')).toBeDefined());

    await vi.advanceTimersByTimeAsync(10_000);

    await vi.waitFor(() => expect(screen.getByText('live')).toBeDefined());
    expect(screen.getByText('4')).toBeDefined();
  });
});
