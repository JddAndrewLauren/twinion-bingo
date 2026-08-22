import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPool, serializePool } from '../src/build.js';
import { POOL_FILENAME, buildAllThemes, discoverThemes, loadTheme } from '../src/generate.js';

const themesRoot = fileURLToPath(new URL('../../../themes', import.meta.url));

/** A theme with entity types and vocabulary the f1 theme knows nothing about. */
function writeSecondTheme(themeDir: string): void {
  mkdirSync(themeDir, { recursive: true });
  writeFileSync(
    join(themeDir, 'theme.json'),
    JSON.stringify({ id: 'indycar', poolVersion: 'v1', freeCentre: 'GREEN FLAG' }),
  );
  writeFileSync(
    join(themeDir, 'entities.json'),
    JSON.stringify({
      oval: [{ key: 'IMS', name: 'Indy', tier: 'superspeedway' }],
    }),
  );
  writeFileSync(
    join(themeDir, 'templates.json'),
    JSON.stringify({
      templates: [
        {
          id: 'oval_caution',
          entityType: 'oval',
          label: 'Caution at {oval}',
          description: 'A full-course caution at {oval}.',
          exclusivityGroups: ['caution:{oval}'],
          tierByEntityTier: { superspeedway: 'certain' },
        },
      ],
    }),
  );
  writeFileSync(join(themeDir, 'handcrafted.json'), JSON.stringify({ squares: [] }));
  writeFileSync(join(themeDir, 'overrides.json'), JSON.stringify({ prune: [], reword: {} }));
}

describe('pool:build', () => {
  it('leaves the committed f1 pool byte-identical — the build is reproducible', () => {
    const rebuilt = serializePool(buildPool(loadTheme(join(themesRoot, 'f1'))));

    expect(rebuilt).toBe(readFileSync(join(themesRoot, 'f1', POOL_FILENAME), 'utf8'));
  });

  it('builds a second theme folder with no change to the generator', () => {
    const root = mkdtempSync(join(tmpdir(), 'twinion-themes-'));
    cpSync(join(themesRoot, 'f1'), join(root, 'f1'), { recursive: true });
    writeSecondTheme(join(root, 'indycar'));

    const built = buildAllThemes(root);

    expect(discoverThemes(root)).toEqual(['f1', 'indycar']);
    expect(built.map((entry) => entry.theme)).toEqual(['f1', 'indycar']);
    expect(JSON.parse(readFileSync(join(root, 'indycar', POOL_FILENAME), 'utf8'))).toEqual({
      themeId: 'indycar',
      poolVersion: 'v1',
      freeCentre: 'GREEN FLAG',
      squares: [
        {
          id: 'indycar.v1:oval_caution:IMS',
          label: 'Caution at Indy',
          description: 'A full-course caution at Indy.',
          tier: 'certain',
          source: 'generated',
          exclusivityGroups: ['caution:IMS'],
          templateId: 'oval_caution',
        },
      ],
    });
  });
});
