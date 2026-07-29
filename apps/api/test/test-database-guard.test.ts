import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The proof that the one shared guard still bites. Every DB-backed suite here
 * TRUNCATEs, and the guard is what stops a stray remote connection string from
 * arming that against the shared Supabase credential. The check runs when the
 * module is evaluated, so each case re-imports it under a stubbed environment.
 */

const ENV_KEY = 'TEST_DATABASE_URL';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadGuard(): Promise<typeof import('./support/test-database.js')> {
  vi.resetModules();
  return import('./support/test-database.js');
}

describe('the truncate-safety guard', () => {
  it('refuses a non-local host loudly instead of truncating through it', async () => {
    vi.stubEnv(ENV_KEY, 'postgres://user:pw@db.example.supabase.co:5432/postgres');

    await expect(loadGuard()).rejects.toThrow(
      /must point at a local, throwaway Postgres; got host "db\.example\.supabase\.co"/,
    );
  });

  it('accepts a local host', async () => {
    const url = 'postgres://postgres:postgres@127.0.0.1:55432/postgres';
    vi.stubEnv(ENV_KEY, url);

    const guard = await loadGuard();

    expect(guard.testDatabaseUrl).toBe(url);
    expect(guard.noTestDatabase).toBe(false);
  });

  it('skips rather than fails when nothing is set', async () => {
    vi.stubEnv(ENV_KEY, undefined);

    const guard = await loadGuard();

    expect(guard.noTestDatabase).toBe(true);
  });
});
