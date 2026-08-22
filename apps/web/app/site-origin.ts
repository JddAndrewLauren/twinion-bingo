import { headers } from 'next/headers';

/**
 * The one origin every URL this app emits is built from — `metadataBase`, the
 * canonical tag, the OG URL, and the share link a host reads aloud.
 *
 * **The request's own host is the default, and `SITE_URL` is the exception.** A
 * preview deployment and a laptop on the LAN are each correctly named by the
 * request that reached them, and hardcoding the production host would point
 * every preview's share link at production. Only production has one name it must
 * always answer to, so only production sets the variable.
 *
 * A malformed `SITE_URL` throws (`new URL` does it) rather than quietly falling
 * back to the request host — a silent fallback is the exact bug this exists to
 * remove, and it matches `apps/api/src/config.ts` refusing to boot on a bad
 * `WEB_ORIGIN`.
 *
 * **Server-only, enforced rather than asserted.** No `NEXT_PUBLIC_` prefix, so
 * Next never inlines it into a client bundle; and this module imports
 * `next/headers`, which Next refuses to compile into a client component at all.
 */
export async function siteOrigin(): Promise<string> {
  // Read per call, not at module scope: a module-scope constant caches at first
  // import, which makes the variable unstubbable in tests and pins the value to
  // whatever the first render saw.
  const override = process.env.SITE_URL?.trim();

  if (override !== undefined && override !== '') {
    // `.origin` is the normalisation: it drops a trailing slash, a path and a
    // default port, so `https://bingo.twinion.net/` and the bare host produce the
    // same string and `${base}/r/${code}` never doubles its slash.
    return new URL(override).origin;
  }

  const requestHeaders = await headers();

  return `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${
    requestHeaders.get('host') ?? 'localhost:3000'
  }`;
}
