import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
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
