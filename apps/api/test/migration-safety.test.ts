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
});

describe('emitted migration SQL', () => {
  it('has migrations to check', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it.each(migrations)('$name drops nothing', ({ sql }) => {
    expect(sql).not.toMatch(/\bDROP\b/i);
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
      const targets = [
        ...sql.matchAll(
          /(?:CREATE TABLE|ALTER TABLE|CREATE TYPE|CREATE(?: UNIQUE)? INDEX "[^"]+" ON)\s+("[^"]+"(?:\."[^"]+")?)/gi,
        ),
      ].map((match) => match[1]);

      expect(targets.length).toBeGreaterThan(0);
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
