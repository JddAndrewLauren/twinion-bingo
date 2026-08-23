'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_BUTTON } from '../action-button';
import { themeName } from '../theme-name';
import {
  deleteRoom,
  endGame,
  fetchOpenRooms,
  kickPlayer,
  type OpenRoom,
} from './admin-api';
import { formatAge } from './age';

/** Live enough to be useful from a phone at the track, without hammering the API. */
const POLL_MS = 10_000;

type Status =
  | { state: 'locked' }
  | { state: 'checking' }
  | { state: 'denied' }
  | { state: 'unlocked'; rooms: OpenRoom[] };

/** A small, thumb-sized secondary action — the primary submit's border-only look, without the row-filling width. */
const ROW_BUTTON = `${ACTION_BUTTON} px-2 text-xs`;

/**
 * The one operator identity in the app (#125): a shared-secret gate over the
 * open room list. Nothing about this screen is player-facing, so it carries
 * none of the per-skin chrome the room and game screens do — it renders once,
 * the same way for whichever skin cookie happens to be set.
 *
 * The secret lives only in this component's state — never written to storage —
 * so `/admin` reveals nothing without it on every load, not only the first
 * one. A wrong secret and an unconfigured server both come back as
 * `AdminUnauthorized` from `admin-api.ts` and are shown identically here: one
 * generic denial, never a hint about whether any room exists.
 *
 * #126 adds the three mutating actions an operator has at the track — end a
 * stale game, delete an abandoned room, kick a player — each a plain
 * `window.confirm` in front of an irreversible write rather than a bespoke
 * dialog: this is an operator's own tool, not the player-facing surface D8's
 * graduated friction was designed for, and each row's own request replaces
 * waiting for the next poll to see the result.
 */
export function RoomList({ apiUrl }: { apiUrl: string }) {
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<Status>({ state: 'locked' });
  const [pending, setPending] = useState<string | null>(null);
  const unlockedSecret = useRef<string | undefined>(undefined);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: 'checking' });

    try {
      const rooms = await fetchOpenRooms(apiUrl, secret);
      unlockedSecret.current = secret;
      setStatus({ state: 'unlocked', rooms });
    } catch {
      setStatus({ state: 'denied' });
    }
  }

  const refresh = useCallback(async () => {
    const opened = unlockedSecret.current;
    if (opened === undefined) return;

    try {
      const rooms = await fetchOpenRooms(apiUrl, opened);
      setStatus({ state: 'unlocked', rooms });
    } catch {
      setStatus({ state: 'denied' });
    }
  }, [apiUrl]);

  useEffect(() => {
    if (status.state !== 'unlocked') return;

    const interval = setInterval(refresh, POLL_MS);

    return () => clearInterval(interval);
  }, [refresh, status.state]);

  /**
   * Every mutating action shares this shape: confirm, send, re-read the list
   * so the row's own result is on screen without waiting for the next poll,
   * and a busy row disables its own buttons — never the whole table's — while
   * its request is out.
   */
  async function runAction(
    key: string,
    confirmMessage: string,
    action: (secretValue: string) => Promise<void>,
  ) {
    const opened = unlockedSecret.current;
    if (opened === undefined) return;
    if (!window.confirm(confirmMessage)) return;

    setPending(key);
    try {
      await action(opened);
      await refresh();
    } catch {
      window.alert('That action failed. The list below is still current — try again.');
    } finally {
      setPending(null);
    }
  }

  const endGameFor = (code: string) =>
    runAction(
      `end:${code}`,
      `End the live game in room ${code}? This cannot be undone.`,
      (opened) => endGame(apiUrl, opened, code),
    );

  const deleteRoomFor = (code: string) =>
    runAction(
      `delete:${code}`,
      `Delete room ${code} and everything in it? This cannot be undone.`,
      (opened) => deleteRoom(apiUrl, opened, code),
    );

  const kickPlayerFrom = (code: string, playerId: string, name: string) =>
    runAction(
      `kick:${playerId}`,
      `Kick ${name} from room ${code}? Their calls stay in the log, but they can no longer play.`,
      (opened) => kickPlayer(apiUrl, opened, code, playerId),
    );

  if (status.state !== 'unlocked') {
    return (
      <form onSubmit={unlock} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Admin secret
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            required
            className="min-h-11 rounded-skin border border-rule bg-raised p-2"
          />
        </label>
        <button
          type="submit"
          disabled={status.state === 'checking' || secret === ''}
          className={ACTION_BUTTON}
        >
          {status.state === 'checking' ? 'Checking…' : 'Unlock'}
        </button>
        {status.state === 'denied' && <p role="alert">Wrong secret.</p>}
      </form>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th className="text-left">Code</th>
          <th className="text-left">Theme</th>
          <th className="text-left">Players</th>
          <th className="text-left">State</th>
          <th className="text-left">Age</th>
          <th className="text-left">Actions</th>
        </tr>
      </thead>
      <tbody>
        {status.rooms.length === 0 ? (
          <tr>
            <td colSpan={6}>No open rooms.</td>
          </tr>
        ) : (
          status.rooms.map((room) => (
            <tr key={room.code}>
              <td className="tracking-widest">{room.code}</td>
              <td>{themeName(room.themeId)}</td>
              <td>
                <ul className="flex flex-col gap-1">
                  {(room.players ?? []).map((player) => (
                    <li key={player.id} className="flex items-center gap-2">
                      <span>{player.name}</span>
                      <button
                        type="button"
                        onClick={() => kickPlayerFrom(room.code, player.id, player.name)}
                        disabled={pending !== null}
                        className={ROW_BUTTON}
                      >
                        {pending === `kick:${player.id}` ? 'Kicking…' : 'Kick'}
                      </button>
                    </li>
                  ))}
                </ul>
              </td>
              <td>{room.gameState}</td>
              <td>{formatAge(room.ageSeconds)}</td>
              <td>
                <div className="flex flex-col gap-1">
                  {room.gameState === 'live' && (
                    <button
                      type="button"
                      onClick={() => endGameFor(room.code)}
                      disabled={pending !== null}
                      className={ROW_BUTTON}
                    >
                      {pending === `end:${room.code}` ? 'Ending…' : 'End game'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteRoomFor(room.code)}
                    disabled={pending !== null}
                    className={ROW_BUTTON}
                  >
                    {pending === `delete:${room.code}` ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
