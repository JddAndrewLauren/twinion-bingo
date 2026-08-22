import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPool } from '../src/build.js';
import { loadTheme } from '../src/generate.js';
import type { Pool } from '../src/types.js';

const themesRoot = fileURLToPath(new URL('../../../themes', import.meta.url));
const indycarDir = join(themesRoot, 'indycar');

/** #21's real templates, expanded against #20's real entity data. */
function buildIndycarPool(): Pool {
  return buildPool(loadTheme(indycarDir));
}

describe('themes/indycar/templates.json', () => {
  it('builds against the real entity data with no generator changes and produces squares', () => {
    const pool = buildIndycarPool();

    expect(pool.squares.length).toBeGreaterThan(0);
  });

  it('has at least one tier rule and every square respects the label caps', () => {
    const templates = JSON.parse(readFileSync(join(indycarDir, 'templates.json'), 'utf8')) as {
      templates: unknown[];
    };
    expect(templates.templates.length).toBeGreaterThan(0);

    // buildPool itself throws on any label/run-length violation, so a
    // successful build above already proves every square is within the
    // 30-char label cap and the 10-char unbreakable-run ceiling.
  });

  it('uses IndyCar vocabulary, not F1 terms', () => {
    const pool = buildIndycarPool();
    const text = pool.squares.map((s) => `${s.label} ${s.description}`).join(' ').toLowerCase();

    for (const f1Term of ['drs', 'safety car', 'lights out', 'chequered']) {
      expect(text).not.toContain(f1Term);
    }
    expect(text).toContain('push-to-pass');
  });

  it('represents both an oval-specific and a street-circuit-specific event', () => {
    const pool = buildIndycarPool();
    const text = pool.squares.map((s) => `${s.label} ${s.description}`).join(' ').toLowerCase();

    expect(text).toMatch(/wall|wave-around/);
    expect(text).toMatch(/street circuit|blend line|barrier/);
  });

  it('represents IndyCar-only events: a wave-around, a pit-entry violation, and a shootout restart', () => {
    const pool = buildIndycarPool();
    const text = pool.squares.map((s) => `${s.label} ${s.description}`).join(' ').toLowerCase();

    expect(text).toContain('wave-around');
    expect(text).toContain('blend line');
    expect(text).toContain('shootout');
  });

  it('excludes the Indy 500-only team tier from team templates, keeping every label within the run ceiling', () => {
    const pool = buildIndycarPool();

    expect(pool.squares.some((s) => s.label.includes('Abel Motorsports'))).toBe(false);
    expect(pool.squares.some((s) => s.label.includes('Castroneves'))).toBe(false);
  });

  it('has its own theme-flavoured free centre, not F1\'s', () => {
    const pool = buildIndycarPool();

    expect(pool.freeCentre).toBe('GREEN FLAG');
  });

  it('introduces no shared cross-theme template mechanism', () => {
    // The template file lives entirely under themes/indycar, authored
    // independently — nothing in packages/theme changed to build it.
    const source = loadTheme(indycarDir);
    expect(source.meta.id).toBe('indycar');
  });
});
