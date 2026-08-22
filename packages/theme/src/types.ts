/** Square tiers drive deck composition (13 certain / 20 medium / 7 rare across 40). */
export type SquareTier = 'certain' | 'medium' | 'rare';

/** Per-entity tier rules may also drop an entity from a template entirely. */
export type TierRule = SquareTier | 'excluded';

export type SquareSource = 'handcrafted' | 'generated';

export interface ThemeMeta {
  /** Namespace of every square id in this theme, e.g. `f1`. */
  id: string;
  /** Bumped when ids change meaning; part of the id, e.g. `v1`. */
  poolVersion: string;
  /** Theme-flavoured label of the free centre square (D4). */
  freeCentre: string;
}

/**
 * One member of an entity type. Any key beyond `key`, `name` and `tier` is a
 * pairing: its name must be another entity type, and its value that entity's
 * key (`"team": "RBR"` on a driver).
 */
export interface Entity {
  key: string;
  name: string;
  tier: string;
  [pairing: string]: string;
}

/** Entity type (`driver`, `team`) to its members. */
export type Entities = Record<string, Entity[]>;

export interface Template {
  id: string;
  entityType: string;
  /** `{driver}` and any pairing of the entity expand to entity names. */
  label: string;
  description: string;
  /**
   * Same placeholders, but expanded to entity keys — groups are ids, not
   * prose. A template declares the full implication closure, not just its own
   * slot: `driver_wins` for Norris also carries the group that
   * `driver_podium` yields for Norris, because winning implies a podium.
   */
  exclusivityGroups: string[];
  /** Entity tier to the tier of the square it yields, or `excluded`. */
  tierByEntityTier: Record<string, TierRule>;
}

export interface HandcraftedSquare {
  key: string;
  label: string;
  description: string;
  tier: SquareTier;
  exclusivityGroups: string[];
}

export interface Overrides {
  /** Square ids to drop from the pool. */
  prune: string[];
  /** Square id to a replacement label and/or description. */
  reword: Record<string, { label?: string; description?: string }>;
}

export interface ThemeSource {
  meta: ThemeMeta;
  entities: Entities;
  templates: Template[];
  handcrafted: HandcraftedSquare[];
  overrides: Overrides;
}

export interface PoolSquare {
  id: string;
  label: string;
  description: string;
  tier: SquareTier;
  source: SquareSource;
  /** Every group this square belongs to; a card holds at most one square per group. */
  exclusivityGroups: string[];
  /** The template that produced it; `null` for hand-crafted squares. */
  templateId: string | null;
}

export interface Pool {
  themeId: string;
  poolVersion: string;
  freeCentre: string;
  squares: PoolSquare[];
}
