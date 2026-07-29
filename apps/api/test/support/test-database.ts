/**
 * The guard every DB-backed suite here shares. These tests TRUNCATE, so they
 * read `TEST_DATABASE_URL` and never `DATABASE_URL` — that variable carries the
 * shared Supabase credential during an operator's real migration run, and the
 * README's sequence would otherwise arm the truncate against it. Unset, the
 * suites skip rather than fail; CI's `db` job provides one.
 */
const url = process.env.TEST_DATABASE_URL;

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Second belt. A `TEST_DATABASE_URL` pointing anywhere but this machine is a
 * mistake worth failing loudly over, never one to silently truncate through.
 */
function assertLocal(candidate: string): void {
  const { hostname } = new URL(candidate);
  if (!localHosts.has(hostname)) {
    throw new Error(
      `TEST_DATABASE_URL must point at a local, throwaway Postgres; got host "${hostname}". ` +
        'These tests truncate every bingo table.',
    );
  }
}

if (url !== undefined && url !== '') assertLocal(url);

export const testDatabaseUrl = url;

export const noTestDatabase = url === undefined || url === '';
