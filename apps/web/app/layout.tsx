import type { Metadata, Viewport } from 'next';
import { siteOrigin } from './site-origin';
import './globals.css';

/**
 * `metadataBase` for the whole app, which is why this is a function rather than
 * the static object it used to be: every route's relative URL — a canonical tag,
 * an OG URL, an OG image — is resolved against it, and there is one resolved
 * origin behind all of them (`app/site-origin.ts`).
 *
 * The cost is named rather than hidden: reading the request's headers here opts
 * every route out of static rendering. That is cheap in this app — `/` and
 * `/legibility` are thin shells over client components with no ISR or CDN
 * caching to lose — and it is what buys one origin everywhere instead of one per
 * route that remembered to ask.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await siteOrigin()),
    title: 'TwinIon Bingo',
    description: 'Themed multiplayer bingo where the squares are events.',
    /**
     * iOS ignores the manifest, so this and `app/apple-icon.png` are what actually
     * make Add to Home Screen work on the iPhones and iPads this is built for.
     * `black-translucent` lets the app's own `neutral-950` run under the status
     * bar rather than leaving a white band above a dark card.
     */
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'Bingo',
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the manifest's, so an installed launch and a browser tab tint the
  // same. Dark is the only theme — see `docs/SURFACES.md`.
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
