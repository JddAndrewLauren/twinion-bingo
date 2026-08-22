import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '../app/r/[code]/page';

let requestHeaders = new Headers();

vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));

afterEach(() => {
  requestHeaders = new Headers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const PRODUCTION = 'https://bingo.twinion.net';

/**
 * The unfurl's URLs, at the level a unit test can honestly claim them: the base
 * plus a relative path. Next resolves the two at render, and
 * `gate/room.gate.ts`'s "the unfurl for a share link" is what proves they land
 * absolute in a real build.
 */
describe('the metadata a room page renders', () => {
  const params = Promise.resolve({ code: 'ABCD' });

  it('names the configured site in production, everywhere a URL appears', async () => {
    vi.stubEnv('SITE_URL', PRODUCTION);
    requestHeaders = new Headers({
      'x-forwarded-proto': 'https',
      host: 'twinion-bingo-web-l7f2q9.vercel.app',
    });

    const metadata = await generateMetadata({ params });

    expect(new URL(metadata.metadataBase!).origin).toBe(PRODUCTION);
    expect(metadata.alternates?.canonical).toBe('/r/ABCD');
    expect(metadata.openGraph).toMatchObject({ url: '/r/ABCD' });
  });

  it('names the requested host when no site is configured', async () => {
    requestHeaders = new Headers({
      'x-forwarded-proto': 'https',
      host: 'twinion-bingo-web-l7f2q9.vercel.app',
    });

    const metadata = await generateMetadata({ params });

    expect(new URL(metadata.metadataBase!).origin).toBe(
      'https://twinion-bingo-web-l7f2q9.vercel.app',
    );
    expect(metadata.alternates?.canonical).toBe('/r/ABCD');
  });

  it('canonicalises a lower-case code to the room it names', async () => {
    // Otherwise `/r/abcd` and `/r/ABCD` are two URLs for one room, and a crawler
    // has no way to know that.
    const metadata = await generateMetadata({
      params: Promise.resolve({ code: ' abcd ' }),
    });

    expect(metadata.alternates?.canonical).toBe('/r/ABCD');
    expect(metadata.title).toBe('Room ABCD');
  });

  it('still unfurls as a card, and still asks the API nothing', async () => {
    // Metadata blocks the room page's initial HTML, so a fetch here would be paid
    // by every player opening a room in order to serve a crawler — the theme is
    // fetched in `opengraph-image.tsx` instead. This is that decision, asserted.
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const metadata = await generateMetadata({ params });

    expect(metadata.openGraph).toMatchObject({ title: 'Room ABCD' });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
