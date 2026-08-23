import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminActionFailed,
  AdminUnauthorized,
  deleteRoom,
  endGame,
  fetchOpenRooms,
  kickPlayer,
} from '../app/admin/admin-api';

const apiUrl = 'https://api.example';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading the open room list', () => {
  it('sends the secret as a bearer token and returns the rooms', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe(
        'Bearer lax-paddock',
      );
      return Response.json({
        rooms: [
          {
            code: 'ABCD',
            themeId: 'f1.v2',
            playerCount: 3,
            gameState: 'live',
            ageSeconds: 125,
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const rooms = await fetchOpenRooms(apiUrl, 'lax-paddock');

    expect(rooms).toEqual([
      {
        code: 'ABCD',
        themeId: 'f1.v2',
        playerCount: 3,
        gameState: 'live',
        ageSeconds: 125,
      },
    ]);
  });

  it('throws AdminUnauthorized on a 401, without exposing any body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    const failure = await fetchOpenRooms(apiUrl, 'wrong').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AdminUnauthorized);
  });
});

describe('force-ending a game', () => {
  it('POSTs to the room’s game/end route with the secret as a bearer token', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${apiUrl}/admin/rooms/ABCD/game/end`);
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).authorization).toBe(
        'Bearer lax-paddock',
      );
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(endGame(apiUrl, 'lax-paddock', 'ABCD')).resolves.toBeUndefined();
  });

  it('throws AdminActionFailed, carrying the status, on a non-2xx reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));

    const failure = await endGame(apiUrl, 'lax-paddock', 'ABCD').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AdminActionFailed);
    expect((failure as AdminActionFailed).status).toBe(404);
  });
});

describe('deleting a room', () => {
  it('DELETEs the room with the secret as a bearer token', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${apiUrl}/admin/rooms/ABCD`);
      expect(init?.method).toBe('DELETE');
      expect((init?.headers as Record<string, string>).authorization).toBe(
        'Bearer lax-paddock',
      );
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteRoom(apiUrl, 'lax-paddock', 'ABCD')).resolves.toBeUndefined();
  });
});

describe('kicking a player', () => {
  it('POSTs to the player’s kick route with the secret as a bearer token', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${apiUrl}/admin/rooms/ABCD/players/p1/kick`);
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).authorization).toBe(
        'Bearer lax-paddock',
      );
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      kickPlayer(apiUrl, 'lax-paddock', 'ABCD', 'p1'),
    ).resolves.toBeUndefined();
  });
});
