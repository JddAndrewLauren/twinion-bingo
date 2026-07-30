import { expect, test } from '@playwright/test';

/**
 * The two install claims jsdom cannot make, and one of them is a claim about
 * something *not* happening.
 *
 * "No service worker is registered" is the kind of criterion that gets signed
 * off in prose and then quietly stops being true the first time somebody adds a
 * PWA plugin — which on race day is a stale bundle served to a phone an hour
 * into a race, with no way to tell the room to hard-refresh. So it is asserted
 * against a real browser rather than written down. `docs/SURFACES.md` exists
 * because four criteria went machine-unverified; this is the same shape.
 *
 * The rest is the install path itself: the manifest and the apple-touch-icon are
 * what a phone reads to offer Add to Home Screen, and a link that 404s is
 * invisible on screen and fatal to the feature.
 */

test.describe('installing to the home screen', () => {
  test('registers no service worker', async ({ page }) => {
    await page.goto('/');

    // `serviceWorker` is absent entirely on an insecure origin, which is also a
    // browser that has registered none — both are the criterion.
    const registrations = await page.evaluate(async () =>
      navigator.serviceWorker === undefined
        ? 0
        : (await navigator.serviceWorker.getRegistrations()).length,
    );

    expect(registrations, 'no service worker may be registered').toBe(0);
  });

  test('links a manifest and an apple touch icon that both resolve', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    for (const rel of ['manifest', 'apple-touch-icon']) {
      const href = await page.locator(`link[rel="${rel}"]`).first().getAttribute('href');
      expect(href, `a ${rel} link must be present`).not.toBeNull();

      const res = await request.get(new URL(href!, page.url()).toString());
      expect(res.status(), `${rel} must resolve`).toBe(200);
    }
  });

  /**
   * A manifest that parses is not the same as a manifest that installs: the two
   * fields a launcher actually acts on are `display` and the icons, and an icon
   * whose `src` is wrong leaves a phone offering a screenshot of the page.
   */
  test('describes a standalone app whose icons are really there', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').first().getAttribute('href');

    const manifest = (await (
      await request.get(new URL(href!, page.url()).toString())
    ).json()) as {
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };

    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((icon) => icon.sizes)).toContain('192x192');
    expect(manifest.icons.map((icon) => icon.sizes)).toContain('512x512');
    // Android crops to a circle, so a launcher with no maskable icon shrinks the
    // square one into a white plate.
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, page.url()).toString());
      expect(res.status(), `${icon.src} must resolve`).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });
});
