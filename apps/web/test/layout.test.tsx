import { afterEach, describe, expect, it, vi } from 'vitest';

// `layout.tsx` imports `./globals.css` for Next's own bundler, which vitest's
// CSS pipeline cannot process (`@tailwindcss/postcss` is a Vite-incompatible
// plugin string here) — and this file, importing `layout.tsx` directly, is the
// first test to pull that import in at all. The stylesheet itself is not what
// this suite is testing; the gate is what proves the tokens render.
vi.mock('../app/globals.css', () => ({}));

let cookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieValue === undefined ? undefined : { name, value: cookieValue },
  }),
  headers: async () => new Headers(),
}));

const { default: RootLayout, generateMetadata, generateViewport } = await import(
  '../app/layout'
);

afterEach(() => {
  cookieValue = undefined;
});

describe('the root layout', () => {
  it('server-renders <html data-skin="pitwall"> with no cookie, and no useEffect', async () => {
    const element = await RootLayout({ children: null });

    expect(element.props['data-skin']).toBe('pitwall');
  });

  it('carries the skin the cookie names', async () => {
    cookieValue = 'scorecard';

    const element = await RootLayout({ children: null });

    expect(element.props['data-skin']).toBe('scorecard');
  });

  it('falls back to pitwall on a cookie value that is not a real skin', async () => {
    cookieValue = 'not-a-skin';

    const element = await RootLayout({ children: null });

    expect(element.props['data-skin']).toBe('pitwall');
  });
});

describe('generateViewport', () => {
  it('answers a themeColor that differs between pitwall and scorecard', async () => {
    const pitwall = await generateViewport();

    cookieValue = 'scorecard';
    const scorecard = await generateViewport();

    expect(pitwall.themeColor).not.toBe(scorecard.themeColor);
  });
});

describe('generateMetadata', () => {
  it('keeps a translucent status bar on the dark skins', async () => {
    const metadata = await generateMetadata();

    expect(metadata.appleWebApp).toMatchObject({
      statusBarStyle: 'black-translucent',
    });
  });

  it('switches to a light status bar on the light skins', async () => {
    cookieValue = 'confetti';

    const metadata = await generateMetadata();

    expect(metadata.appleWebApp).toMatchObject({ statusBarStyle: 'default' });
  });
});
