import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, callSquare, joinRoom, retractCall, startGame } from '../app/room-api';

const apiUrl = 'https://api.example';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The API answers a refusal with `{ error: string }` — see `apps/api/src/games/routes.ts`.
 * These four are the callers `room-screen.tsx` catches (#76); each should throw the
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
