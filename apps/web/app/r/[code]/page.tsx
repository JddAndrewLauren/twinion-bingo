import type { Metadata } from 'next';
import { siteOrigin } from '../../site-origin';
import { RoomScreen } from './room-screen';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

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
    /*
      Set here as well as in the root layout, even though metadata inherits.
      Relative image URLs in the sibling `opengraph-image` need an absolute base,
      and an unfurler is a different machine — a relative one silently unfurls as
      a link with no card. That is the one gated claim in the app, so it does not
      rest on inheritance holding.
    */
    metadataBase: new URL(await siteOrigin()),
    title: `Room ${room}`,
    description: `Join room ${room} and play along.`,
    /*
      Relative on purpose: `metadataBase` is the single origin, so the canonical
      tag, the OG URL and the OG image cannot disagree about which host this room
      lives on. `room` is already normalised, so `/r/abcd` canonicalises to
      `/r/ABCD` rather than being a second URL for the same room.
    */
    alternates: { canonical: `/r/${room}` },
    openGraph: {
      type: 'website',
      url: `/r/${room}`,
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

  // The one resolved origin — production's configured name, or the host the
  // request arrived on everywhere else — so the link a player is told to pass on
  // is the same one the unfurl and the canonical tag name.
  const base = await siteOrigin();

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
