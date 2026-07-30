import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // A build-time macro the Next compiler rewrites and vitest does not; see
      // the note in the stub.
      'next/font/google': fileURLToPath(
        new URL('./test/next-font-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // The gate drives a real browser at real viewports and is run by Playwright,
    // not by vitest — which cannot tell a 68px cell from a 680px one.
    exclude: ['gate/**', 'node_modules/**'],
  },
});
