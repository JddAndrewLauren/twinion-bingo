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
 */
export function RosterPreview({ roster }: { roster: Roster }) {
  return (
    <div className="skin-roster flex flex-col gap-1">
      <p className="skin-roster-heading text-xs font-semibold text-muted">
        On the grid ({roster.players.length})
      </p>
      <ul aria-label="Players in the room" className="flex flex-col">
        {roster.players.map((player, index) => (
          <li
            key={player.id}
            className="flex items-center gap-2 py-1.5 text-sm"
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
      </ul>
    </div>
  );
}
