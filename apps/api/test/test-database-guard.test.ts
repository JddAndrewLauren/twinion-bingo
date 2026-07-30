import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The proof that the one shared guard still bites. Every DB-backed suite here
 * TRUNCATEs, and the guard is what stops a stray remote connection string from
 * arming that against the shared Supabase credential, and a stale local one
 * from arming it against a sibling workspace's database. The checks run when
 * the module is evaluated, so each case re-imports it under a stubbed
 * environment.
 */

const ENV_KEY = 'TEST_DATABASE_URL';
const WORKSPACE_KEY = 'CONDUCTOR_WORKSPACE_PATH';

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
    // Outside a Conductor workspace — which is also CI's shape, and pins it:
    // belt 3 has nothing to derive an expected database from, so `/postgres`
    // is fine here and refused in the workspace cases below.
    vi.stubEnv(WORKSPACE_KEY, undefined);
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

  it("accepts this workspace's own database", async () => {
    vi.stubEnv(WORKSPACE_KEY, '/Users/john/conductor/workspaces/twinion-bingo/gwangju');
    const url = 'postgres://postgres:postgres@127.0.0.1:55432/bingo_gwangju';
    vi.stubEnv(ENV_KEY, url);

    const guard = await loadGuard();

    expect(guard.testDatabaseUrl).toBe(url);
  });

  it("refuses a sibling workspace's database", async () => {
    vi.stubEnv(WORKSPACE_KEY, '/Users/john/conductor/workspaces/twinion-bingo/gwangju');
    vi.stubEnv(ENV_KEY, 'postgres://postgres:postgres@127.0.0.1:55432/bingo_belmopan');

    await expect(loadGuard()).rejects.toThrow(
      /own database "bingo_gwangju"; got "bingo_belmopan"/,
    );
  });

  it('refuses the shared maintenance database, which is where every collision happened', async () => {
    vi.stubEnv(WORKSPACE_KEY, '/Users/john/conductor/workspaces/twinion-bingo/gwangju');
    vi.stubEnv(ENV_KEY, 'postgres://postgres:postgres@127.0.0.1:55432/postgres');

    await expect(loadGuard()).rejects.toThrow(/got "postgres"/);
  });

  it('names the command that fixes it', async () => {
    vi.stubEnv(WORKSPACE_KEY, '/tmp/workspaces/gwangju');
    vi.stubEnv(ENV_KEY, 'postgres://postgres:postgres@127.0.0.1:55432/postgres');

    await expect(loadGuard()).rejects.toThrow(/pnpm db:workspace/);
  });

  it('sanitises a hyphenated workspace directory the same way the provisioner does', async () => {
    vi.stubEnv(WORKSPACE_KEY, '/tmp/workspaces/my-branch');
    const url = 'postgres://postgres:postgres@127.0.0.1:55432/bingo_my_branch';
    vi.stubEnv(ENV_KEY, url);

    const guard = await loadGuard();

    expect(guard.testDatabaseUrl).toBe(url);
  });
});
