'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTION_BUTTON } from '../action-button';
import { themeName } from '../theme-name';
import { fetchOpenRooms, type OpenRoom } from './admin-api';
import { formatAge } from './age';

/** Live enough to be useful from a phone at the track, without hammering the API. */
const POLL_MS = 10_000;

type Status =
  | { state: 'locked' }
  | { state: 'checking' }
  | { state: 'denied' }
  | { state: 'unlocked'; rooms: OpenRoom[] };

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
 */
export function RoomList({ apiUrl }: { apiUrl: string }) {
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<Status>({ state: 'locked' });
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

  useEffect(() => {
    if (status.state !== 'unlocked') return;

    const interval = setInterval(() => {
      const opened = unlockedSecret.current;
      if (opened === undefined) return;

      fetchOpenRooms(apiUrl, opened)
        .then((rooms) => setStatus({ state: 'unlocked', rooms }))
        .catch(() => setStatus({ state: 'denied' }));
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [apiUrl, status.state]);

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
        </tr>
      </thead>
      <tbody>
        {status.rooms.length === 0 ? (
          <tr>
            <td colSpan={5}>No open rooms.</td>
          </tr>
        ) : (
          status.rooms.map((room) => (
            <tr key={room.code}>
              <td className="tracking-widest">{room.code}</td>
              <td>{themeName(room.themeId)}</td>
              <td>{room.playerCount}</td>
              <td>{room.gameState}</td>
              <td>{formatAge(room.ageSeconds)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
