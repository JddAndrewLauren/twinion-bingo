import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest 4 does not read `.env`, and Vite's `loadEnv` only exposes
 * `VITE_`-prefixed keys on `import.meta.env` (an empty `envPrefix` throws). So
 * a Conductor workspace's provisioned `TEST_DATABASE_URL` would sit in
 * `apps/api/.env` while every DB-backed suite silently skipped. Lift it here,
 * by hand, and lift **only** it:
 *
 * - `DATABASE_URL` is deliberately not read. That variable carries the shared
 *   project credential during an operator's migration run, and ADR-0001's third
 *   mechanism exists precisely so it can never enter a truncating process. A
 *   bare `process.loadEnvFile()` would undo that — do not use it.
 * - An explicit value on the command line or in CI wins; `.env` only fills a
 *   gap.
 * - `.env` is gitignored, so no CI job has one and every CI job is untouched.
 */
function liftTestDatabaseUrl(): void {
  if (process.env.TEST_DATABASE_URL !== undefined) return;

  // Resolved against this file, not cwd — `vitest run` from the repo root has a
  // different one.
  const envFile = fileURLToPath(new URL('.env', import.meta.url));
  if (!existsSync(envFile)) return;

  // `[ \t]`, never `\s` — and a leading `#` does not match, so the
  // commented-out block in `.env.example` stays inert.
  const match = /^[ \t]*TEST_DATABASE_URL[ \t]*=(.*)$/m.exec(
    readFileSync(envFile, 'utf8'),
  );
  if (match?.[1] === undefined) return;

  const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  if (value !== '') process.env.TEST_DATABASE_URL = value;
}

liftTestDatabaseUrl();

export default defineConfig({
  test: {
    /**
     * Three suites now truncate every bingo table against the one throwaway
     * Postgres, and vitest runs files in parallel by default — so run them one
     * file at a time. Two suites truncating each other's rows mid-test is a
     * deadlock or a phantom failure, never a real one.
     */
    fileParallelism: false,
  },
});
