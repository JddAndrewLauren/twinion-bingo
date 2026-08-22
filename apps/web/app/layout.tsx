import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { parseSkin, SKIN_COOKIE, type Skin } from './skin';
import { SKIN_FONT_VARIABLES } from './skin-fonts';
import { siteOrigin } from './site-origin';
import './globals.css';

/**
 * `themeColor` per skin (README's *Design tokens*: Pit Wall and Slipstream are
 * both dark, Confetti and Scorecard both light — so a phone's own chrome, not
 * only the page, has to tell them apart). Pit Wall's value is today's app
 * colour rather than the handoff's real one, matching `globals.css`'s own
 * "today's exact colours" carve-out for this skin in this slice.
 */
const THEME_COLOR: Record<Skin, string> = {
  pitwall: '#0a0a0a',
  slipstream: '#0e0e12',
  confetti: '#fffbf2',
  scorecard: '#f7f1e4',
};

/**
 * The skin this request is rendering, read once from the cookie
 * `skin-button.tsx` writes. No fallback to `localStorage` and no client-side
 * read: the root layout is already dynamic (`generateMetadata` below reads
 * request headers via `siteOrigin()`), so a cookie read costs nothing extra
 * here and is what lets `data-skin` and `themeColor` both be correct on the
 * very first paint — no `useEffect` flips them after the fact.
 */
async function currentSkin(): Promise<Skin> {
  const store = await cookies();

  return parseSkin(store.get(SKIN_COOKIE)?.value);
}

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
  const skin = await currentSkin();
  /**
   * Light on Confetti and Scorecard, dark on Pit Wall and Slipstream.
   * `black-translucent` lets the app's own dark surface run under the status
   * bar, which is exactly wrong over a cream page — a translucent black bar
   * over `#fffbf2` or `#f7f1e4` reads as a dark smear across the top of the
   * screen rather than disappearing into it.
   */
  const statusBarStyle =
    skin === 'confetti' || skin === 'scorecard' ? 'default' : 'black-translucent';

  return {
    metadataBase: new URL(await siteOrigin()),
    title: 'TwinIon Bingo',
    description: 'Themed multiplayer bingo where the squares are events.',
    // iOS ignores the manifest, so this and `app/apple-icon.png` are what
    // actually make Add to Home Screen work on the iPhones and iPads this is
    // built for.
    appleWebApp: {
      capable: true,
      statusBarStyle,
      title: 'Bingo',
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const skin = await currentSkin();

  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: THEME_COLOR[skin],
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const skin = await currentSkin();

  return (
    <html lang="en" data-skin={skin} className={SKIN_FONT_VARIABLES}>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
