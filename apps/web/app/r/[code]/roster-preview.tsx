import type { Roster } from '../../room-api';

/**
 * The join screen's roster — a structural piece #104 builds because the app did
 * not have one: before this, a player choosing a name had no view of who was
 * already in the room. The handoff's "Roster per theme" table draws Pit Wall's
 * as an indexed table with `HOST`/`YOU` tags; the other three skins' pill-row
 * treatment is a later slice, so this component renders the same rows for every
 * skin and only `[data-skin='pitwall'] .skin-roster` in `globals.css` paints
 * them as a table.
 *
 * `you` is always `null` on this screen (`RoomScreen` only renders it before a
 * name is chosen), so there is never a `— YOU` row here — the tag exists purely
 * for the host, until the player submits a name and the screen swaps to the
 * post-join roster (`room-screen.tsx`'s own `<ul>`, untouched by this issue).
 *
 * #105 (Slipstream) and #106 (Confetti) both need the trailing "+N" chip the
 * handoff's pill-row skins truncate to at phone widths ("four names plus an
 * accent-filled `+N` chip" / Confetti's own "Roster per theme" entry: four
 * names at phone, all nine at iPad). The two slices arrived at the same
 * element under two different names, so the rebase onto #105 keeps **one**
 * `<li>` carrying both hooks — `data-overflow-chip` (Slipstream's) and
 * `data-roster-more` (Confetti's) — rather than two chips: Slipstream's gate
 * asserts `getByText('+2')` in Playwright strict mode, which a duplicated
 * chip would break.
 *
 * It renders whenever the roster holds more than four players — a
 * *data*-conditional, not a *skin*-conditional, the same way the `HOST` tag
 * above is — and stays `hidden` by default (Tailwind, `display: none`, backed
 * by the skin-agnostic `[data-roster-more]` rule in `globals.css`) so Pit
 * Wall's table (which has no truncation) never sees it. Only
 * `[data-skin='slipstream'] .skin-roster li[data-overflow-chip]` and
 * `[data-skin='confetti'] [data-roster-more]` in `globals.css` make it
 * visible, each under its own skin's narrow-width media query — the same
 * query that hides players 5+ for that skin.
 *
 * The merged chip is **not** `aria-hidden`: #105 shipped it announced, and
 * since the rows it stands in for are `display: none` (so already out of the
 * accessibility tree) at the widths where it shows, the chip is the only
 * remaining signal that names were truncated. #106's copy carried
 * `aria-hidden`; one element cannot be both, and dropping it preserves #105's
 * behaviour while giving Confetti the strictly more accessible one. Neither
 * skin's gate asserts on this attribute.
 */
const ROSTER_PREVIEW_TRUNCATE = 4;

export function RosterPreview({ roster }: { roster: Roster }) {
  const overflow = roster.players.length - ROSTER_PREVIEW_TRUNCATE;

  return (
    <div className="skin-roster flex flex-col gap-1">
      <p className="skin-roster-heading text-xs font-semibold text-muted">
        On the grid ({roster.players.length})
      </p>
      <ul
        aria-label="Players in the room"
        className="skin-roster-list flex flex-col"
      >
        {roster.players.map((player, index) => (
          <li
            key={player.id}
            data-roster-overflow={
              index >= ROSTER_PREVIEW_TRUNCATE ? 'true' : undefined
            }
            className="skin-roster-row flex items-center gap-2 py-1.5 text-sm"
          >
            <span className="skin-roster-index tabular-nums">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1 truncate">{player.name}</span>
            {player.id === roster.hostPlayerId && (
              <span className="skin-roster-tag">Host</span>
            )}
          </li>
        ))}
        {overflow > 0 && (
          <li
            data-overflow-chip
            data-roster-more
            className="skin-roster-row hidden"
          >
            +{overflow}
          </li>
        )}
      </ul>
    </div>
  );
}
