import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPool } from '../src/build.js';
import type { Entities, Template, ThemeSource } from '../src/types.js';

const themesRoot = fileURLToPath(new URL('../../../themes', import.meta.url));

function loadIndycarEntities(): Entities {
  return JSON.parse(
    readFileSync(join(themesRoot, 'indycar', 'entities.json'), 'utf8'),
  ) as Entities;
}

/**
 * A template per entity type, with a rule for every tier that type actually
 * uses. Not real theme content (#21 authors that, including real labels) —
 * this is the smallest harness that exercises `buildPool`'s pairing- and
 * tier-resolution validation against `themes/indycar/entities.json` with zero
 * generator changes, the same way `generate.test.ts` proves a second theme
 * folder builds. The placeholder is expanded into `description`, not `label`
 * — the 30-char / 10-char-run label caps are a square-authoring concern for
 * #21's real templates, not a property of the entity data this checks.
 */
function synthesizeTemplates(entities: Entities): Template[] {
  return Object.entries(entities).map(([entityType, members]) => {
    const tiers = new Set(members.map((entity) => entity.tier));
    return {
      id: `${entityType}_check`,
      entityType,
      label: 'Entry check',
      description: `{${entityType}}`,
      exclusivityGroups: [`check:{${entityType}}`],
      tierByEntityTier: Object.fromEntries([...tiers].map((tier) => [tier, 'medium' as const])),
    };
  });
}

describe('themes/indycar/entities.json', () => {
  it('validates against the generator with zero generator changes', () => {
    const entities = loadIndycarEntities();
    const source: ThemeSource = {
      meta: { id: 'indycar', poolVersion: 'v1', freeCentre: 'GREEN FLAG' },
      entities,
      templates: synthesizeTemplates(entities),
      handcrafted: [],
      overrides: { prune: [], reword: {} },
    };

    expect(() => buildPool(source)).not.toThrow();
  });

  it('represents Indy 500-only entries as a distinct entity type from full-season drivers', () => {
    const entities = loadIndycarEntities();

    expect(entities.driver?.every((entity) => entity.tier !== 'indy500')).toBe(true);
    expect(entities.indy500Driver?.length).toBeGreaterThan(0);
    expect(entities.indy500Driver?.every((entity) => entity.tier === 'indy500')).toBe(true);
  });

  it('does not transplant F1 tier distribution: IndyCar teams field very different car counts', () => {
    const entities = loadIndycarEntities();
    const driversPerTeam = new Map<string, number>();
    for (const driver of [...(entities.driver ?? []), ...(entities.indy500Driver ?? [])]) {
      const team = driver.team ?? '';
      driversPerTeam.set(team, (driversPerTeam.get(team) ?? 0) + 1);
    }

    const counts = new Set(driversPerTeam.values());
    // F1's teams are uniformly 2 cars each; IndyCar's are not.
    expect(counts.size).toBeGreaterThan(1);
  });
});
