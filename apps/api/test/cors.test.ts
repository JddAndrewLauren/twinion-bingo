import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { unconnectedDb } from './support/db.js';

const allowedOrigins = [
  'https://twinion-bingo-web.vercel.app',
  'http://localhost:3000',
];

describe('cross-origin access', () => {
  it('lets the deployed web app fetch from the browser', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/health', {
      headers: { Origin: 'https://twinion-bingo-web.vercel.app' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://twinion-bingo-web.vercel.app',
    );
  });

  it('lets a local dev server fetch from the browser', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/health', {
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3000',
    );
  });

  it('lets a preview deployment of the same Vercel project fetch', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/health', {
      headers: {
        // A real preview hostname Vercel minted for a branch on this project.
        Origin:
          'https://twinion-bingo-web-git-api-cors-config-john-dominguez-s-projects.vercel.app',
      },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://twinion-bingo-web-git-api-cors-config-john-dominguez-s-projects.vercel.app',
    );
  });

  it('refuses an origin that is not the web app', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.example' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a different Vercel project', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/health', {
      headers: { Origin: 'https://someone-elses-app.vercel.app' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a host that merely starts with the web app origin', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/health', {
      headers: { Origin: 'https://twinion-bingo-web.vercel.app.evil.example' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  /**
   * The SSE route is the one the browser holds open for two hours, and it is the
   * one whose CORS failure is silent: `EventSource` reports a bare `error` event
   * with no status and no message, so a missing header looks like a network
   * blip. Both of these reach the stream route rather than `/health` — the 400
   * shape check runs before the route touches the database, which is why they
   * belong here rather than in the DB-backed suite.
   */
  it('lets the web app open the room stream from the browser', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/rooms/ABC0/stream', {
      headers: { Origin: 'https://twinion-bingo-web.vercel.app' },
    });

    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://twinion-bingo-web.vercel.app',
    );
  });

  it('refuses to let a foreign origin open the room stream', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/rooms/ABC0/stream', {
      headers: { Origin: 'https://evil.example' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers the preflight a JSON POST triggers', async () => {
    const app = createApp({ allowedOrigins, db: unconnectedDb() });

    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://twinion-bingo-web.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://twinion-bingo-web.vercel.app',
    );
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain(
      'content-type',
    );
  });
});
