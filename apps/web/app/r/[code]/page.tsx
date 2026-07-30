import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { RoomScreen } from './room-screen';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/** The host the request arrived on, which is the host the share link names. */
async function origin(): Promise<string> {
  const requestHeaders = await headers();

  return `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${
    requestHeaders.get('host') ?? 'localhost:3000'
  }`;
}

/**
 * The unfurl, because the share link is the primary join path and it mostly gets
 * pasted into a group chat.
 *
 * **This fetches nothing, and that is the trade.** `generateMetadata` blocks the
 * room page's initial HTML, so an API round-trip here is paid by every player
 * opening a room in order to serve a crawler. The room code is in `params` and
 * therefore free; the theme costs a request, so it is fetched in
 * `opengraph-image.tsx` instead — which only unfurlers hit. Both the code and
 * the theme still land in the unfurl, via the image.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const room = (await params).code.trim().toUpperCase();

  return {
    // Relative image URLs in the sibling `opengraph-image` need an absolute base,
    // and an unfurler is a different machine — a relative one silently unfurls
    // as a link with no card.
    metadataBase: new URL(await origin()),
    title: `Room ${room}`,
    description: `Join room ${room} and play along.`,
    openGraph: {
      type: 'website',
      title: `Room ${room}`,
      description: `Join room ${room} and play along.`,
    },
    twitter: { card: 'summary_large_image' },
  };
}

/** The share link, and the primary way anyone but the host reaches a room. */
export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const room = code.trim().toUpperCase();

  // Built on the server from the request that arrived, so the link a player is
  // told to pass on is the same host they reached the app on.
  const base = await origin();

  /*
    No column and no padding here. The game screen is full-bleed — a `max-w-md` on
    the page is what pinned an iPad cell to a phone cell's width while the type went
    on growing past it (#47) — so each of the screen's states owns its own chrome
    instead. Everything before the deal keeps the narrow centred column.
  */
  return (
    <main className="min-h-dvh">
      <RoomScreen
        apiUrl={apiUrl}
        code={room}
        shareLink={`${base}/r/${room}`}
      />
    </main>
  );
}
