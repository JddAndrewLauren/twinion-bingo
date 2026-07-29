# Themes

Themes are repo folders (D10). Authoring is by hand; expansion happens at build time and the
output is committed and reviewed (D9).

```
themes/<theme>/
  theme.json           id, poolVersion, free-centre label
  entities.json        entity types -> members, with tiers and pairings
  templates.json       one line x many entities, with per-entity tier rules
  handcrafted.json     one-off squares written in full
  overrides.json       prune list + reworded lines
      |  pnpm pool:build
      v
  pool.generated.json  <- COMMITTED and reviewed; never hand-edited
```

`pnpm pool:build` builds *every* folder here, so a new theme needs no change to the generator
(`packages/theme`).

## entities.json

A map of entity type to its members. Beyond `key`, `name` and `tier`, any field is a **pairing**:
its name must be another entity type and its value that entity's `key`.

```json
{
  "team": [{ "key": "MCL", "name": "McLaren", "tier": "podium" }],
  "driver": [{ "key": "NOR", "name": "Norris", "tier": "podium", "team": "MCL" }]
}
```

Entity tiers (F1's are `podium`, `points`, `field`) are the theme's own vocabulary. Square tiers are
always `certain` / `medium` / `rare`, because deck composition depends on them.

## templates.json

`tierByEntityTier` is what stops one line x 22 drivers producing 22 squares with wildly different
real-world odds. Every entity tier in the theme needs a rule; `excluded` drops the entity.

Placeholders expand to entity **names** in `label` and `description`, and to entity **keys** in
`exclusivityGroup` — groups are identifiers, not prose. A driver template may use `{team}`, since
the pairing resolves it.

## Square ids

`<theme>.<poolVersion>:<templateId>:<entityKey>`, or `<theme>.<poolVersion>:hand:<key>` for
hand-crafted squares. Marks are derived from these ids, so they must stay stable — bump
`poolVersion` rather than changing what an existing id means.

## The build fails loudly on

a label over 30 characters, a duplicate id, a template referencing an unknown entity type or
placeholder, an entity paired to a missing entity, a template missing a tier rule, and an override
pointing at a square that no longer exists. Every fault in a run is reported together.

## Status

`themes/f1` is a starter pool that exercises the machinery. Authoring the real ~180 squares is #16.
