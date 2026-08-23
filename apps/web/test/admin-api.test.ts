import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminUnauthorized, fetchOpenRooms } from '../app/admin/admin-api';

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
