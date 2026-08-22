import type {
  Entities,
  Entity,
  HandcraftedSquare,
  Overrides,
  Pool,
  PoolSquare,
  Template,
  ThemeMeta,
  ThemeSource,
} from './types.js';

/**
 * Set by the phone: at 390pt portrait a 5x5 cell is ~68pt. One pool serves both
 * devices, so the cap is the phone's.
 */
export const LABEL_MAX_CHARS = 30;

/**
 * Set by the iPad: a card cell stops growing at ~77px while its text does not,
 * so an 11-character unbreakable run overflows horizontally on `ipad-11-*`.
 * A live defect (#47); until it is fixed the pool works around it.
 */
export const RUN_MAX_CHARS = 10;

const PLACEHOLDER = /\{([^}]*)\}/g;

/**
 * A theme's id as everything outside the theme folder spells it: the manifest's
 * `id` and `poolVersion` joined. Square ids carry it as their namespace and
 * `rooms.theme_id` stores it, so the format lives here and nowhere else.
 */
export function composeThemeId(meta: {
  id: string;
  poolVersion: string;
}): string {
  return `${meta.id}.${meta.poolVersion}`;
}

/**
 * A label's unbreakable runs: the text between one wrap opportunity and the
 * next. Whitespace breaks and is dropped; a hyphen breaks *after* itself, so it
 * stays with the run it ends and counts towards its width. Punctuation hanging
 * off a word does not break at all.
 */
function unbreakableRuns(label: string): string[] {
  return label
    .split(/\s+/)
    .flatMap((word) => word.split(/(?<=-)/))
    .filter((run) => run.length > 0);
}

/** Fields of an entity that are not pairings to another entity type. */
const RESERVED_ENTITY_FIELDS = new Set(['key', 'name', 'tier']);

class BuildErrors {
  private readonly messages: string[] = [];

  add(message: string): void {
    if (!this.messages.includes(message)) this.messages.push(message);
  }

  throwIfAny(themeId: string): void {
    if (this.messages.length === 0) return;
    throw new Error(
      `pool:build failed for theme "${themeId}":\n` +
        this.messages.map((m) => `  - ${m}`).join('\n'),
    );
  }
}

/**
 * Placeholder expansions for one entity: names for prose, keys for ids. Returns
 * null when a pairing cannot be resolved, so the caller skips the entity.
 */
function expansionsFor(
  entityType: string,
  entity: Entity,
  entities: Entities,
  errors: BuildErrors,
): { names: Record<string, string>; keys: Record<string, string> } | null {
  const names: Record<string, string> = { [entityType]: entity.name };
  const keys: Record<string, string> = { [entityType]: entity.key };

  for (const [field, value] of Object.entries(entity)) {
    if (RESERVED_ENTITY_FIELDS.has(field)) continue;
    const paired = entities[field]?.find((candidate) => candidate.key === value);
    if (!paired) {
      errors.add(
        `entity "${entityType}:${entity.key}" pairs with unknown entity "${field}:${value}"`,
      );
      return null;
    }
    names[field] = paired.name;
    keys[field] = paired.key;
  }

  return { names, keys };
}

function expand(
  text: string,
  expansions: Record<string, string>,
  where: string,
  errors: BuildErrors,
): string {
  return text.replace(PLACEHOLDER, (match, token: string) => {
    const value = expansions[token];
    if (value === undefined) {
      errors.add(`${where} references unknown entity "${token}"`);
      return match;
    }
    return value;
  });
}

function expandTemplate(
  template: Template,
  entity: Entity,
  entities: Entities,
  meta: ThemeMeta,
  errors: BuildErrors,
): PoolSquare | null {
  const rule = template.tierByEntityTier[entity.tier];
  if (rule === undefined) {
    errors.add(
      `template "${template.id}" has no tier rule for entity tier "${entity.tier}" (entity "${entity.key}")`,
    );
    return null;
  }
  if (rule === 'excluded') return null;

  const expansions = expansionsFor(template.entityType, entity, entities, errors);
  if (!expansions) return null;

  const where = `template "${template.id}" (entity "${entity.key}")`;
  return {
    id: `${composeThemeId(meta)}:${template.id}:${entity.key}`,
    label: expand(template.label, expansions.names, where, errors),
    description: expand(template.description, expansions.names, where, errors),
    tier: rule,
    source: 'generated',
    exclusivityGroups: template.exclusivityGroups.map((group) =>
      expand(group, expansions.keys, where, errors),
    ),
    templateId: template.id,
  };
}

function handcraftedSquare(square: HandcraftedSquare, meta: ThemeMeta): PoolSquare {
  return {
    id: `${composeThemeId(meta)}:hand:${square.key}`,
    label: square.label,
    description: square.description,
    tier: square.tier,
    source: 'handcrafted',
    exclusivityGroups: square.exclusivityGroups,
    templateId: null,
  };
}

function applyOverrides(
  squares: PoolSquare[],
  overrides: Overrides,
  errors: BuildErrors,
): PoolSquare[] {
  const ids = new Set(squares.map((square) => square.id));
  const pruned = new Set(overrides.prune);

  for (const id of overrides.prune) {
    if (!ids.has(id)) errors.add(`overrides prune unknown square "${id}"`);
  }
  for (const id of Object.keys(overrides.reword)) {
    if (!ids.has(id)) errors.add(`overrides reword unknown square "${id}"`);
    else if (pruned.has(id)) errors.add(`overrides both prune and reword square "${id}"`);
  }

  return squares
    .filter((square) => !pruned.has(square.id))
    .map((square) => {
      const reword = overrides.reword[square.id];
      return reword ? { ...square, ...reword } : square;
    });
}

/**
 * Expands a theme folder's authored data into its pool. Pure — every failure is
 * collected and thrown together, so one run reports every data fault.
 */
export function buildPool(source: ThemeSource): Pool {
  const { meta, entities, templates, handcrafted, overrides } = source;
  const errors = new BuildErrors();

  const squares = handcrafted.map((square) => handcraftedSquare(square, meta));

  for (const template of templates) {
    const population = entities[template.entityType];
    if (!population) {
      errors.add(`template "${template.id}" references unknown entity type "${template.entityType}"`);
      continue;
    }
    for (const entity of population) {
      const square = expandTemplate(template, entity, entities, meta, errors);
      if (square) squares.push(square);
    }
  }

  const overridden = applyOverrides(squares, overrides, errors);

  const seen = new Set<string>();
  for (const square of overridden) {
    if (seen.has(square.id)) errors.add(`duplicate square id "${square.id}"`);
    seen.add(square.id);
    if (square.label.length > LABEL_MAX_CHARS) {
      errors.add(
        `square "${square.id}" has a ${square.label.length}-char label, over the ${LABEL_MAX_CHARS} cap: "${square.label}"`,
      );
    }
    for (const run of unbreakableRuns(square.label)) {
      if (run.length > RUN_MAX_CHARS) {
        errors.add(
          `square "${square.id}" has a ${run.length}-char unbreakable run "${run}", over the ${RUN_MAX_CHARS} ceiling: "${square.label}"`,
        );
      }
    }
  }

  errors.throwIfAny(meta.id);

  return {
    themeId: meta.id,
    poolVersion: meta.poolVersion,
    freeCentre: meta.freeCentre,
    // Sorted by id, and by code unit rather than locale, so the committed file
    // is byte-identical across runs and machines.
    squares: overridden.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

export function serializePool(pool: Pool): string {
  return `${JSON.stringify(pool, null, 2)}\n`;
}
