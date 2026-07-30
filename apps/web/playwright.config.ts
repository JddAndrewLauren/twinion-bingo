import { defineConfig, devices } from '@playwright/test';

/**
 * The visual gate `docs/SURFACES.md` has been specifying since #4 and nothing has
 * been able to run. It landed here because #13 is the first issue with a real screen
 * to point it at: #12 drove Playwright from a scratch directory outside the repo, on
 * the grounds that a throwaway route with a deletion date is the wrong thing to hang
 * the repo's permanent gate off — and that decision cost its measurements, which
 * cannot be reproduced because the scripts went with the directory.
 *
 * Three things about the setup are the gate rather than the plumbing:
 *
 * - **WebKit, with touch.** The targets are iPhone and iPad Safari, and Chromium is
 *   not that engine. #12 found at least one behaviour (`font-stretch` on the system
 *   face) that was never expected to survive Safari and was graded in Chromium
 *   anyway. `hasTouch` matters as much: #12's three worst defects were reachable only
 *   under `.tap()` and invisible to `.click()` in a desktop viewport.
 *
 * - **Exact viewports, not device profiles.** `docs/SURFACES.md` names four sizes and
 *   issues write criteria against those names, so a run at "whatever an iPhone 13
 *   is" would not be answering the criterion. #12 published a whole set of
 *   `phone-small` numbers measured at 320x568 against a registry that says 375x667.
 *
 * - **A production build, not `next dev`.** The dev overlay mounts a portal at the
 *   bottom of the page, which is exactly where the bottom slot has to prove it covers
 *   nothing.
 */
const VIEWPORTS = {
  'phone-small': { width: 375, height: 667 },
  phone: { width: 390, height: 844 },
  'ipad-11-portrait': { width: 834, height: 1194 },
  'ipad-11-landscape': { width: 1194, height: 834 },
} as const;

const PORT = 3210;

export default defineConfig({
  testDir: './gate',
  testMatch: '**/*.gate.ts',
  // The gate measures boxes. A retry that passes is a flake to investigate, not a
  // pass — and a card either fits or it does not.
  retries: 0,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    /*
      A gate whose whole premise is that these defects are invisible to review has to
      hand back something to look at when it fails. Without these the CI job's
      `gate-report` artifact is an error stub and nothing else — which is the same
      "signed off by eye, with nothing to look at" problem one level up.
    */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: Object.entries(VIEWPORTS).map(([name, viewport]) => ({
    name,
    use: {
      ...devices['Desktop Safari'],
      viewport,
      // `hasTouch` is what makes `.tap()` real; `isMobile` is what makes the
      // `width=device-width` meta tag in `layout.tsx` mean anything, so between
      // them the page is laid out the way the hardware lays it out.
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    },
  })),
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Never reachable: every call the app makes is intercepted, and a URL that
    // cannot resolve is what makes a missed interception fail loudly rather than
    // quietly hitting something real.
    env: { NEXT_PUBLIC_API_URL: 'http://api.gate.invalid' },
  },
});
