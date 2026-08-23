import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../drizzle.config.js';

/**
 * The safety gate for D3. This database is shared with the twinion project, and
 * drizzle-kit manages every schema unless told otherwise — so the thing that has
 * to be true is not "the config looks right" but "the SQL we are about to run
 * cannot touch anything outside `bingo`". These assertions read the emitted SQL.
 */

const migrationsDir = fileURLToPath(new URL('../drizzle', import.meta.url));

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }));

describe('drizzle config isolation', () => {
  it('filters drizzle-kit down to the bingo schema', () => {
    expect(config.schemaFilter).toEqual(['bingo']);
  });

  it('keeps its own migration output directory', () => {
    expect(config.out).toBe('./drizzle');
  });

  /**
   * The other half of the isolation guarantee, and the half that is easy to lose
   * because it lives in a different file. `schemaFilter` governs what drizzle-kit
   * *diffs*; it says nothing about where the migrator journals what it applied,
   * which defaults to a `drizzle` schema that twinion's chain in this shared
   * database would also claim. Two projects sharing one `__drizzle_migrations`
   * table is worse than no isolation, so `migrate()` is passed
   * `migrationsSchema: 'bingo'` — asserted against the source because
   * `migrate.ts` is a script that runs its migration on import.
   */
  it('journals applied migrations inside the bingo schema', () => {
    const migrator = readFileSync(
      fileURLToPath(new URL('../src/db/migrate.ts', import.meta.url)),
      'utf8',
    );

    expect(migrator).toMatch(/migrationsSchema:\s*'bingo'/);
  });
});

describe('emitted migration SQL', () => {
  it('has migrations to check', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  /**
   * Dropping used to be forbidden outright. It cannot stay that way — changing a
   * unique index is a drop-and-recreate, and ADR-0004 drops one outright — but
   * the reason for the ban survives the narrowing: drizzle-kit diffs a schema it
   * has been filtered down to, so anything it cannot see reads as absent and is a
   * candidate for a drop. What is safe to permit is therefore the narrowest thing
   * that admits the migration in front of it: an index, or (ADR-0010's
   * `games.deck` -> `rooms.deck` move) a named column, one at a time, on a
   * schema-qualified `bingo` table. A table, a schema, a type, or an unqualified
   * name is still refused.
   */
  const ALLOWED_DROP =
    /^DROP INDEX (?:IF EXISTS )?"bingo"\."[a-z0-9_]+";?$|^ALTER TABLE "bingo"\."[a-z0-9_]+" DROP COLUMN "[a-z0-9_]+";?$/i;

  /**
   * One SQL statement per element, so the allowlist can anchor. drizzle-kit
   * separates statements with a `--> statement-breakpoint` comment rather than
   * with the semicolon alone, and splitting on `;` while leaving the marker in
   * place hands every statement but the first a comment prefix that no anchored
   * pattern can match — which would refuse the drop-and-recreate this gate was
   * widened to admit, and refuse it for the wrong reason.
   */
  const statementsOf = (sql: string): string[] =>
    sql
      .replaceAll('--> statement-breakpoint', '')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement !== '')
      .map((statement) => `${statement};`);

  it.each(migrations)('$name drops nothing but a bingo index or column', ({ sql }) => {
    const drops = statementsOf(sql).filter((statement) =>
      /\bDROP\b/i.test(statement),
    );

    for (const statement of drops) {
      expect(statement).toMatch(ALLOWED_DROP);
    }
  });

  /**
   * The allowlist is only as good as what it refuses, and a regex that is too
   * generous fails silently — so the refusals are asserted rather than assumed,
   * and so is the splitting, which is the half that is easy to get wrong.
   */
  it('refuses every drop but a schema-qualified bingo index or column', () => {
    for (const statement of [
      'DROP TABLE "bingo"."room_events";',
      'DROP SCHEMA "bingo";',
      'DROP TYPE "bingo"."room_event_kind";',
      'DROP INDEX "room_events_call_unique";',
      'DROP INDEX "drizzle"."room_events_call_unique";',
      'DROP INDEX "bingo"."a", "bingo"."b";',
      'ALTER TABLE "drizzle"."room_events" DROP COLUMN "square_id";',
      'ALTER TABLE "room_events" DROP COLUMN "square_id";',
      'ALTER TABLE "bingo"."room_events" DROP COLUMN "a", "bingo"."room_events" DROP COLUMN "b";',
    ]) {
      expect(statement).not.toMatch(ALLOWED_DROP);
    }

    expect('DROP INDEX "bingo"."room_events_call_unique";').toMatch(ALLOWED_DROP);
    expect('DROP INDEX IF EXISTS "bingo"."room_events_call_unique";').toMatch(
      ALLOWED_DROP,
    );
    // ADR-0010's `games.deck` -> `rooms.deck` move: a named column drop on a
    // schema-qualified `bingo` table, the same narrowness as the index case.
    expect('ALTER TABLE "bingo"."games" DROP COLUMN "deck";').toMatch(
      ALLOWED_DROP,
    );

    // A drop that is not the file's first statement is still a permitted drop.
    const recreate = [
      'DROP INDEX "bingo"."room_events_call_unique";',
      '--> statement-breakpoint',
      'CREATE INDEX "room_events_call_idx" ON "bingo"."room_events" ("game_id");',
      '--> statement-breakpoint',
      'DROP INDEX "bingo"."room_events_room_code_seq_idx";',
    ].join('\n');

    expect(statementsOf(recreate)).toHaveLength(3);
    for (const statement of statementsOf(recreate).filter((s) =>
      /\bDROP\b/i.test(s),
    )) {
      expect(statement).toMatch(ALLOWED_DROP);
    }
  });

  it.each(migrations)('$name never names the public schema', ({ sql }) => {
    expect(sql).not.toMatch(/\bpublic\b/i);
  });

  it.each(migrations)(
    '$name qualifies every schema-qualified name as bingo',
    ({ sql }) => {
      const schemas = [...sql.matchAll(/"([^"]+)"\."[^"]+"/g)].map(
        (match) => match[1],
      );

      expect(new Set(schemas)).toEqual(new Set(['bingo']));
    },
  );

  it.each(migrations)(
    '$name creates and alters only objects inside bingo',
    ({ sql }) => {
      // `IF NOT EXISTS` is optional in both, and in the same places: a shape the
      // counter recognises but the parser does not is a create that slips through
      // the qualification check below without ever being looked at.
      const EXISTS = '(?: IF NOT EXISTS)?';
      const CREATES_OR_ALTERS = new RegExp(
        `CREATE TABLE${EXISTS}|ALTER TABLE${EXISTS}|CREATE TYPE${EXISTS}|CREATE(?: UNIQUE)? INDEX${EXISTS}`,
        'gi',
      );

      const targets = [
        ...sql.matchAll(
          new RegExp(
            `(?:CREATE TABLE${EXISTS}|ALTER TABLE${EXISTS}|CREATE TYPE${EXISTS}|CREATE(?: UNIQUE)? INDEX${EXISTS} "[^"]+" ON)\\s+("[^"]+"(?:\\."[^"]+")?)`,
            'gi',
          ),
        ),
      ].map((match) => match[1]);

      // Every create or alter in the file was parsed into a target. A drop-only
      // migration legitimately has none; what this refuses is a create the regex
      // above quietly failed to match, which would otherwise pass unexamined.
      expect(targets).toHaveLength([...sql.matchAll(CREATES_OR_ALTERS)].length);

      for (const target of targets) {
        expect(target).toMatch(/^"bingo"\./);
      }
    },
  );

  it.each(migrations)('$name creates the bingo schema idempotently', ({ sql }) => {
    const createSchemas = [...sql.matchAll(/CREATE SCHEMA[^;]*/gi)].map(
      (match) => match[0],
    );

    for (const statement of createSchemas) {
      expect(statement).toMatch(/CREATE SCHEMA IF NOT EXISTS "bingo"/i);
    }
  });
});
