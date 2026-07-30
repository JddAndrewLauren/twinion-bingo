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

a label over 30 characters, an unbreakable run over 10 characters (below), a duplicate id, a
template referencing an unknown entity type or
placeholder, an entity paired to a missing entity, a template missing a tier rule, and an override
pointing at a square that no longer exists. Every fault in a run is reported together.

## The tighter rule: unbreakable runs

**No unbreakable run in a label over 10 characters.** The 30-character cap is about the whole label;
this is about a single run inside it, and it is the tighter constraint. A card cell stops growing at
~77px while its text does not, so an 11-character run overflows *horizontally* on `ipad-11-*`. That
is a live defect, tracked as #47, and until it is fixed the pool works around it: see the reading in
`docs/SURFACES.md`.

An **unbreakable run** is the text between one wrap opportunity and the next, which is not the same
as a word:

- A **space** breaks.
- A **hyphen** breaks, after it — a browser may wrap `Re-Explained` as `Re-` / `Explained`, so that
  label's longest run is 9, not 12. Same for `5-Second` and `A-List`.
- **Punctuation hanging off a word does not break.** Count the quote marks, the exclamation mark and
  the full stop as part of the run they touch: `Dangerous!"` is eleven, which is over the line.

So the measurement is: split each label on whitespace and hyphens, and take the longest piece. A
hyphen ends the piece it breaks after, so it counts towards that piece's length. The build applies
this measurement itself (`RUN_MAX_CHARS` in `packages/theme`), so a label that breaks the rule fails
`pnpm pool:build` rather than reaching a card.

## Status

`themes/f1` is authored (#16): 300 squares at poolVersion `v2`, reviewed line by line in #59. It sits
at both legibility ceilings with no margin — the longest labels are 30 characters and the longest
unbreakable runs are 10 — so a new square is as likely to be refused by the cap as accepted.
