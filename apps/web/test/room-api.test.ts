import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  callSquare,
  joinRoom,
  rerollCard,
  retractCall,
  startGame,
} from '../app/room-api';

const apiUrl = 'https://api.example';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The API answers a refusal with `{ error: string }` — see `apps/api/src/games/routes.ts`.
 * These five are the callers `room-screen.tsx` catches (#76); each should throw the
 * same `ApiError`, carrying the status and that body's `error` string verbatim.
 */
describe('a failing request', () => {
  it('carries the status and the parsed error body, for startGame', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'only the host can start a game' }, { status: 403 }),
      ),
    );

    const failure = await startGame(apiUrl, 'ABCD', 'a-token').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(403);
    expect((failure as ApiError).body).toBe('only the host can start a game');
  });

  it('carries the status and the parsed error body, for callSquare', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'this game has finished' }, { status: 409 }),
      ),
    );

    const failure = await callSquare(apiUrl, 'game-id', 'sq-1', 'a-token').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(409);
    expect((failure as ApiError).body).toBe('this game has finished');
  });

  it('carries the status and the parsed error body, for retractCall', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'no call in this game has that seq' }, { status: 404 }),
      ),
    );

    const failure = await retractCall(apiUrl, 'game-id', 5, 'a-token').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(404);
    expect((failure as ApiError).body).toBe('no call in this game has that seq');
  });

  it('carries the status and the parsed error body, for joinRoom', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'no room with that code' }, { status: 404 }),
      ),
    );

    const failure = await joinRoom(apiUrl, 'ABCD', 'Bea').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(404);
    expect((failure as ApiError).body).toBe('no room with that code');
  });

  it('carries the status and the parsed error body, for rerollCard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'this card has a mark' }, { status: 409 }),
      ),
    );

    const failure = await rerollCard(apiUrl, 'game-id', 'a-token').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(409);
    expect((failure as ApiError).body).toBe('this card has a mark');
  });

  it('falls back to the raw body when the response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad gateway', { status: 502 })),
    );

    const failure = await startGame(apiUrl, 'ABCD', 'a-token').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(502);
    expect((failure as ApiError).body).toBe('bad gateway');
  });

  it('falls back to an empty body when the response has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );

    const failure = await callSquare(apiUrl, 'game-id', 'sq-1', 'a-token').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(403);
    expect((failure as ApiError).body).toBe('');
  });
});

/**
 * `rerollCard` is the one caller whose whole point is the body it returns — the
 * replacement view the screen applies straight from the 200 (#87) — so its success
 * path is worth an assertion the refusal cases cannot make.
 */
describe('rerollCard', () => {
  it('posts to the game\'s reroll endpoint with the bearer token, and returns the view', async () => {
    const replacement = { id: 'game-id', state: 'live', marks: [] };
    const fetched = vi.fn(async () => Response.json(replacement));
    vi.stubGlobal('fetch', fetched);

    const game = await rerollCard(apiUrl, 'game id/1', 'a-token');

    expect(fetched).toHaveBeenCalledWith(
      `${apiUrl}/games/game%20id%2F1/card/reroll`,
      { method: 'POST', headers: { authorization: 'Bearer a-token' } },
    );
    expect(game).toEqual(replacement);
  });
});
