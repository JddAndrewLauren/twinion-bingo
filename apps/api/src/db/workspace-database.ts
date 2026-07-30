/**
 * One derivation of a Conductor workspace's own database name, shared by the
 * provisioner that creates it and the test guard that refuses anything else.
 *
 * Four workspaces of this repo run at once, every DB-backed suite TRUNCATEs on
 * entry, and Drizzle's journal is a single table — so one shared database means
 * one workspace's `pnpm test` wipes its siblings' fixtures and one workspace's
 * migration is recorded as applied for every branch. Both happened. The fix is
 * a database per workspace, and this is the only place its name is computed:
 * the provisioner and the guard agreeing is the whole point.
 *
 * Pure by design — no `postgres`, no `child_process`. Both callers import it,
 * and one of them is a test guard that must not open a connection to answer.
 *
 * See `docs/adr/0005-a-database-per-conductor-workspace.md`.
 */

/** `NAMEDATALEN - 1` — Postgres truncates identifiers past this, silently. */
const MAX_IDENTIFIER_LENGTH = 63;

const PREFIX = 'bingo_';

/**
 * This workspace's database name, or `undefined` outside a Conductor
 * workspace — CI and a plain clone have nothing to derive from and nothing to
 * isolate against, so callers treat `undefined` as "not applicable" rather
 * than as an error. That is what keeps CI inert.
 *
 * Derived from the workspace **directory basename**, not the branch or the
 * workspace name: the directory is what survives a rename and a branch switch,
 * and a workspace that changed database mid-session would strand its own data.
 */
export function workspaceDatabaseName(
  env: Record<string, string | undefined>,
): string | undefined {
  const path = env.CONDUCTOR_WORKSPACE_PATH;
  if (path === undefined || path === '') return undefined;

  const basename = path.replace(/\/+$/, '').split('/').pop() ?? '';
  // Unquoted Postgres identifiers admit only `[a-z0-9_$]` and cannot lead with
  // a digit; the prefix settles the second, this settles the first. Hyphens
  // fold to underscores, so `my-branch` and `my_branch` share a database —
  // accepted, since two workspaces that differ only in that are already a
  // naming mistake.
  const sanitised = basename.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (sanitised === '') {
    throw new Error(
      `CONDUCTOR_WORKSPACE_PATH "${path}" has no usable directory name to derive a database from.`,
    );
  }

  return `${PREFIX}${sanitised}`.slice(0, MAX_IDENTIFIER_LENGTH);
}

/** The database a connection string points at, for comparing against the above. */
export function databaseNameFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}
