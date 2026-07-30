/**
 * The guard every DB-backed suite here shares. These tests TRUNCATE, so they
 * read `TEST_DATABASE_URL` and never `DATABASE_URL` — that variable carries the
 * shared Supabase credential during an operator's real migration run, and the
 * README's sequence would otherwise arm the truncate against it. Unset, the
 * suites skip rather than fail; CI's `db` job provides one.
 */
import {
  databaseNameFromUrl,
  workspaceDatabaseName,
} from '../../src/db/workspace-database.js';

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

/**
 * Third belt. Local is not enough when four Conductor workspaces share one
 * local Postgres: a stale or hand-pasted `TEST_DATABASE_URL` truncated two
 * siblings' fixtures and corrupted the shared migration journal. So the URL
 * must name *this* workspace's own database.
 *
 * Inert outside a Conductor workspace — CI and a plain clone have one database
 * and nothing to collide with, so there is nothing here to enforce.
 */
function assertThisWorkspace(candidate: string): void {
  const expected = workspaceDatabaseName(process.env);
  if (expected === undefined) return;

  const actual = databaseNameFromUrl(candidate);
  if (actual !== expected) {
    throw new Error(
      `TEST_DATABASE_URL must point at this workspace's own database "${expected}"; ` +
        `got "${actual}". These tests truncate every bingo table, so pointing them at ` +
        'another workspace or the shared `postgres` database wipes its fixtures. ' +
        'Run `pnpm db:workspace` to provision this workspace and fix apps/api/.env.',
    );
  }
}

if (url !== undefined && url !== '') {
  assertLocal(url);
  assertThisWorkspace(url);
}

export const testDatabaseUrl = url;

export const noTestDatabase = url === undefined || url === '';
