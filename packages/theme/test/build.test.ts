import { describe, expect, it } from 'vitest';
import { buildPool, serializePool } from '../src/build.js';
import type { ThemeSource } from '../src/types.js';

/** A two-entity-type theme small enough to reason about square by square. */
function source(patch: Partial<ThemeSource> = {}): ThemeSource {
  return {
    meta: { id: 't', poolVersion: 'v1', freeCentre: 'GO' },
    entities: {
      team: [
        { key: 'AA', name: 'Alpha', tier: 'top' },
        { key: 'BB', name: 'Beta', tier: 'low' },
      ],
      racer: [
        { key: 'R1', name: 'Rio', tier: 'top', team: 'AA' },
        { key: 'R2', name: 'Ravi', tier: 'low', team: 'BB' },
      ],
    },
    templates: [
      {
        id: 'racer_wins',
        entityType: 'racer',
        label: '{racer} wins',
        description: '{racer} wins it for {team}.',
        exclusivityGroups: ['out:{racer}'],
        tierByEntityTier: { top: 'medium', low: 'excluded' },
      },
    ],
    handcrafted: [
      {
        key: 'flag',
        label: 'Red flag',
        description: 'The race is stopped.',
        tier: 'rare',
        exclusivityGroups: ['flag'],
      },
    ],
    overrides: { prune: [], reword: {} },
    ...patch,
  };
}

/** One hand-crafted square, so a test can vary nothing but the label. */
function handcraftedWithLabel(label: string) {
  return { key: 'one', label, description: '', tier: 'rare' as const, exclusivityGroups: ['one'] };
}

describe('buildPool', () => {
  it('expands a template against its entities, resolving pairings by name', () => {
    const pool = buildPool(source());

    expect(pool.squares).toContainEqual({
      id: 't.v1:racer_wins:R1',
      label: 'Rio wins',
      description: 'Rio wins it for Alpha.',
      tier: 'medium',
      source: 'generated',
      exclusivityGroups: ['out:R1'],
      templateId: 'racer_wins',
    });
  });

  it('drops entities whose tier rule is excluded', () => {
    const pool = buildPool(source());

    expect(pool.squares.map((square) => square.id)).not.toContain('t.v1:racer_wins:R2');
  });

  it('keeps hand-crafted squares as their own source with no template', () => {
    const pool = buildPool(source());

    expect(pool.squares).toContainEqual({
      id: 't.v1:hand:flag',
      label: 'Red flag',
      description: 'The race is stopped.',
      tier: 'rare',
      source: 'handcrafted',
      exclusivityGroups: ['flag'],
      templateId: null,
    });
  });

  it('carries the theme metadata the deck draw needs', () => {
    const pool = buildPool(source());

    expect(pool.themeId).toBe('t');
    expect(pool.poolVersion).toBe('v1');
    expect(pool.freeCentre).toBe('GO');
  });

  it('applies overrides: prune removes, reword replaces', () => {
    const pool = buildPool(
      source({
        overrides: {
          prune: ['t.v1:hand:flag'],
          reword: { 't.v1:racer_wins:R1': { label: 'Rio takes it' } },
        },
      }),
    );

    expect(pool.squares.map((square) => square.id)).toEqual(['t.v1:racer_wins:R1']);
    expect(pool.squares[0]?.label).toBe('Rio takes it');
    expect(pool.squares[0]?.description).toBe('Rio wins it for Alpha.');
  });

  it('serializes identically across runs, sorted by id', () => {
    expect(serializePool(buildPool(source()))).toBe(serializePool(buildPool(source())));
    expect(buildPool(source()).squares.map((square) => square.id)).toEqual([
      't.v1:hand:flag',
      't.v1:racer_wins:R1',
    ]);
  });

  it('fails on a label over 30 characters', () => {
    const build = () =>
      buildPool(
        source({
          handcrafted: [
            {
              key: 'long',
              label: 'A label that is altogether too long',
              description: '',
              tier: 'rare',
              exclusivityGroups: ['long'],
            },
          ],
        }),
      );

    expect(build).toThrow(/35-char label, over the 30 cap/);
  });

  it('accepts a label whose longest unbreakable run is 10 characters', () => {
    const build = () => buildPool(source({ handcrafted: [handcraftedWithLabel('Hulkenberg out')] }));

    expect(build).not.toThrow();
  });

  it('fails on an unbreakable run over 10 characters', () => {
    const build = () => buildPool(source({ handcrafted: [handcraftedWithLabel('Championship over')] }));

    expect(build).toThrow(/12-char unbreakable run "Championship", over the 10 ceiling/);
  });

  it('accepts a long word that a hyphen breaks', () => {
    const build = () => buildPool(source({ handcrafted: [handcraftedWithLabel('2026 Regs Re-Explained')] }));

    expect(build).not.toThrow();
  });

  it('counts hanging punctuation as part of the run it touches', () => {
    const build = () => buildPool(source({ handcrafted: [handcraftedWithLabel('That was Dangerous!"')] }));

    expect(build).toThrow(/11-char unbreakable run "Dangerous!"", over the 10 ceiling/);
  });

  it('fails on a duplicate square id', () => {
    const handcrafted = source().handcrafted;
    const build = () => buildPool(source({ handcrafted: [...handcrafted, ...handcrafted] }));

    expect(build).toThrow(/duplicate square id "t\.v1:hand:flag"/);
  });

  it('fails on a template referencing an unknown entity type', () => {
    const build = () =>
      buildPool(
        source({
          templates: [
            {
              id: 'ghost',
              entityType: 'marshal',
              label: '{marshal} waves',
              description: '',
              exclusivityGroups: ['ghost'],
              tierByEntityTier: { top: 'medium' },
            },
          ],
        }),
      );

    expect(build).toThrow(/template "ghost" references unknown entity type "marshal"/);
  });

  it('fails on a template referencing an unknown placeholder', () => {
    const templates = source().templates.map((template) => ({
      ...template,
      label: '{racer} and {sponsor}',
    }));
    const build = () => buildPool(source({ templates }));

    expect(build).toThrow(/references unknown entity "sponsor"/);
  });

  it('fails on an entity paired to an entity that does not exist', () => {
    const entities = source().entities;
    const build = () =>
      buildPool(
        source({
          entities: { ...entities, racer: [{ key: 'R1', name: 'Rio', tier: 'top', team: 'ZZ' }] },
        }),
      );

    expect(build).toThrow(/entity "racer:R1" pairs with unknown entity "team:ZZ"/);
  });

  it('fails on a template with no tier rule for an entity tier', () => {
    const templates = source().templates.map((template) => ({
      ...template,
      tierByEntityTier: { top: 'medium' as const },
    }));
    const build = () => buildPool(source({ templates }));

    expect(build).toThrow(/no tier rule for entity tier "low" \(entity "R2"\)/);
  });

  it('fails on overrides pointing at squares that no longer exist', () => {
    const build = () =>
      buildPool(source({ overrides: { prune: ['t.v1:hand:gone'], reword: {} } }));

    expect(build).toThrow(/overrides prune unknown square "t\.v1:hand:gone"/);
  });

  it('reports every fault in one failure rather than the first', () => {
    const build = () =>
      buildPool(
        source({
          handcrafted: [
            {
              key: 'long',
              label: 'A label that is altogether too long',
              description: '',
              tier: 'rare',
              exclusivityGroups: ['long'],
            },
          ],
          overrides: { prune: ['t.v1:hand:gone'], reword: {} },
        }),
      );

    expect(build).toThrow(/prune unknown square[\s\S]*too long/);
  });
});
