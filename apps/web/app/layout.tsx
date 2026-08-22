import type { Metadata, Viewport } from 'next';
import { currentSkin } from './current-skin';
import type { Skin } from './skin';
import { SKIN_FONT_VARIABLES } from './skin-fonts';
import { siteOrigin } from './site-origin';
import './globals.css';

/**
 * `themeColor` per skin (README's *Design tokens*: Pit Wall and Slipstream are
 * both dark, Confetti and Scorecard both light — so a phone's own chrome, not
 * only the page, has to tell them apart). Pit Wall's value is now the
 * handoff's real surface colour (`#0a0a0b`), retuned by #104 along with
 * `globals.css`'s own token block.
 *
 * This used to carry a note that the value matched `app/manifest.ts`'s, so an
 * installed launch and a browser tab tinted the same. That invariant does not
 * survive four skins — a manifest is one static document and cannot follow a
 * per-request cookie — so it is retired rather than restated, with the reasoning
 * recorded at the manifest's own `background_color`. It still holds for Pit
 * Wall, which is every fresh install.
 */
const THEME_COLOR: Record<Skin, string> = {
  pitwall: '#0a0a0b',
  slipstream: '#0e0e12',
  confetti: '#fffbf2',
  scorecard: '#f7f1e4',
};

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
