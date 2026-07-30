import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { workspaceDatabaseName } from './workspace-database.js';

/**
 * Gives this Conductor workspace its own database, its own tables and its own
 * migration journal:
 *
 *   pnpm db:workspace
 *
 * Four workspaces sharing one local database truncated each other's fixtures
 * and shared one Drizzle journal. Run by Conductor's `setup` script, and safe
 * to re-run by hand — every step is idempotent.
 *
 * Node rather than shell: `postgres` is already a dependency, so reachability is
 * a real `SELECT 1` rather than a port poke, and this file is typechecked and
 * linted where a `settings.toml` string is not.
 *
 * See `docs/adr/0005-a-database-per-conductor-workspace.md`.
 */

const HOST = '127.0.0.1';
const PORT = 55432;
const CONTAINER = 'bingo-pg';
const IMAGE = 'postgres:17-alpine';
const MAINTENANCE_URL = `postgres://postgres:postgres@${HOST}:${PORT}/postgres`;

// `src/db/` up two is `apps/api/`, which is also where `drizzle/` and the env
// files live, and the cwd `db:migrate` needs.
const apiDir = fileURLToPath(new URL('../../', import.meta.url));
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
const envExample = fileURLToPath(new URL('../../.env.example', import.meta.url));

function databaseUrl(name: string): string {
  return `postgres://postgres:postgres@${HOST}:${PORT}/${name}`;
}

/** A TCP connect with its own timeout — `SELECT 1` would wait far longer. */
async function reachable(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port: PORT });
    const settle = (answer: boolean): void => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

function docker(...args: string[]): number | null {
  return spawnSync('docker', args, { stdio: 'inherit' }).status;
}

/**
 * Reachability first, and only then Docker. That is what makes this
 * container-name-agnostic: whatever is already listening on 55432 — a
 * differently named container, a native Postgres — is honoured rather than
 * fought with.
 */
async function ensurePostgres(): Promise<void> {
  if (await reachable(2_000)) {
    console.log(`postgres already listening on ${HOST}:${PORT}`);
    return;
  }

  const exists =
    spawnSync('docker', ['inspect', '--type=container', CONTAINER], {
      stdio: 'ignore',
    }).status === 0;

  console.log(
    exists ? `starting container ${CONTAINER}` : `creating container ${CONTAINER}`,
  );
  const status = exists
    ? docker('start', CONTAINER)
    : docker(
        'run',
        '-d',
        '--name',
        CONTAINER,
        '-e',
        'POSTGRES_PASSWORD=postgres',
        '-p',
        `${PORT}:5432`,
        IMAGE,
      );
  if (status !== 0) {
    throw new Error(
      `Could not bring up a Postgres on ${HOST}:${PORT}. Start one yourself, or see the README.`,
    );
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await reachable(1_000)) {
      console.log(`postgres listening on ${HOST}:${PORT}`);
      return;
    }
    // A refused connection returns instantly, so pace the poll.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Postgres did not start listening on ${HOST}:${PORT} within 30s.`);
}

async function ensureDatabase(name: string): Promise<void> {
  const sql = postgres(MAINTENANCE_URL, { max: 1 });
  try {
    const existing = await sql`select 1 from pg_database where datname = ${name}`;
    if (existing.length > 0) {
      console.log(`database ${name} already exists`);
      return;
    }
    // `CREATE DATABASE` cannot run inside a transaction, so it goes as a lone
    // unsafe statement. The name is `[a-z0-9_]`-only by construction, and
    // quoted regardless.
    await sql.unsafe(`create database "${name}"`);
    console.log(`created database ${name}`);
  } catch (error) {
    // 42P04: a sibling's setup won the race and produced the state we wanted.
    if ((error as { code?: string }).code !== '42P04') throw error;
    console.log(`database ${name} already exists`);
  } finally {
    await sql.end();
  }
}

/**
 * Line-level upsert of exactly two keys, so `WEB_ORIGIN`, `PORT` and every
 * comment survive a re-run and a hand edit.
 *
 * `TEST_DATABASE_URL` is forced — it exists only to point the truncating suites
 * here. `DATABASE_URL` is rewritten only when what is already there is local:
 * an operator who deliberately aimed it at the shared project gets told, not
 * overruled.
 */
function writeEnv(name: string): void {
  if (!existsSync(envFile)) {
    copyFileSync(envExample, envFile);
    console.log('created apps/api/.env from .env.example');
  }

  const url = databaseUrl(name);
  let contents = upsert(readFileSync(envFile, 'utf8'), 'TEST_DATABASE_URL', url);

  const current = /^[ \t]*DATABASE_URL[ \t]*=(.*)$/m.exec(contents)?.[1]?.trim();
  if (current !== undefined && current !== '' && !isLocal(current)) {
    console.warn(
      `apps/api/.env: leaving DATABASE_URL alone — it points somewhere that is not this machine. ` +
        `This workspace's database is ${name}.`,
    );
  } else {
    contents = upsert(contents, 'DATABASE_URL', url);
  }

  writeFileSync(envFile, contents);
  console.log(`apps/api/.env points at ${name}`);
}

function upsert(contents: string, key: string, value: string): string {
  // `[ \t]`, never `\s`: with the `m` flag `\s*` swallows the preceding blank
  // line, so a re-run would not be a fixpoint. A commented-out `# KEY=` does
  // not match either, which is what lets `.env.example` ship one.
  const line = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm');
  if (line.test(contents)) return contents.replace(line, `${key}=${value}`);
  return `${contents.endsWith('\n') ? contents : `${contents}\n`}\n${key}=${value}\n`;
}

function isLocal(candidate: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
      new URL(candidate).hostname,
    );
  } catch {
    return false;
  }
}

/**
 * Spawned, never imported: `migrate.ts` runs on import, resolves `drizzle/`
 * against cwd, and `migration-safety.test.ts` asserts on its text. Folding
 * provisioning into it would blur "migrations are applied by one command".
 */
function migrate(name: string): void {
  const { status } = spawnSync('pnpm', ['run', 'db:migrate'], {
    cwd: apiDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl(name) },
  });
  if (status !== 0) throw new Error('db:migrate failed.');
}

const name = workspaceDatabaseName(process.env);
if (name === undefined) {
  throw new Error(
    'CONDUCTOR_WORKSPACE_PATH is unset, so there is no workspace to provision a database for. ' +
      'Outside a Conductor workspace, set DATABASE_URL and TEST_DATABASE_URL yourself — see the README.',
  );
}

await ensurePostgres();
await ensureDatabase(name);
writeEnv(name);
migrate(name);

console.log(`workspace database ready: ${name}`);
