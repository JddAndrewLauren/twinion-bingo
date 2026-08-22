import { afterEach, describe, expect, it, vi } from 'vitest';
import { siteOrigin } from '../app/site-origin';

/**
 * The request as it arrived, swapped per case. A real `Headers` rather than a
 * shape of ours, so `.get` has the case-insensitive semantics Next hands the
 * page — a fake object literal would pass on a header name the real one misses.
 */
let requestHeaders = new Headers();

vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));

afterEach(() => {
  requestHeaders = new Headers();
  vi.unstubAllEnvs();
});

const PRODUCTION = 'https://bingo.twinion.net';

describe('resolving the origin a room URL is built from', () => {
  it('lets the configured site URL beat the host the request arrived on', async () => {
    // A production request reaching the app on its deployment hostname, which is
    // the case this whole variable exists for: the share link, the canonical tag
    // and the unfurl must all name the room's one real home.
    vi.stubEnv('SITE_URL', PRODUCTION);
    requestHeaders = new Headers({
      'x-forwarded-proto': 'https',
      host: 'twinion-bingo-web-l7f2q9.vercel.app',
    });

    expect(await siteOrigin()).toBe(PRODUCTION);
  });

  it('normalises a configured site URL to its bare origin', async () => {
    vi.stubEnv('SITE_URL', `  ${PRODUCTION}/  `);

    // The share link is built by concatenation, so a trailing slash that survives
    // here is a `//r/ABCD` handed to a group chat.
    expect(`${await siteOrigin()}/r/ABCD`).toBe(`${PRODUCTION}/r/ABCD`);
  });

  it('keeps the request origin when no site URL is configured', async () => {
    // A preview deployment has no fixed name to configure, so the request that
    // reached it is the answer — a preview whose links pointed at production
    // would be untestable.
    requestHeaders = new Headers({
      'x-forwarded-proto': 'https',
      host: 'twinion-bingo-web-l7f2q9.vercel.app',
    });

    expect(await siteOrigin()).toBe(
      'https://twinion-bingo-web-l7f2q9.vercel.app',
    );
  });

  it('treats an empty site URL as unset', async () => {
    // Vercel hands back an empty string for a variable defined with no value.
    vi.stubEnv('SITE_URL', '   ');
    requestHeaders = new Headers({ host: '192.168.1.24:3000' });

    expect(await siteOrigin()).toBe('http://192.168.1.24:3000');
  });

  it('falls back to the local app when the request names no host', async () => {
    expect(await siteOrigin()).toBe('http://localhost:3000');
  });

  it('refuses a site URL that is not a URL', async () => {
    // Loudly, rather than quietly reverting to the request host: a silent
    // fallback is the bug this variable was added to remove.
    vi.stubEnv('SITE_URL', 'bingo.twinion.net');

    await expect(siteOrigin()).rejects.toThrow();
  });
});
