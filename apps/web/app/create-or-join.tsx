'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { storeToken } from './player-token';
import { createRoom } from './room-api';

export function CreateOrJoin({ apiUrl }: { apiUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateFailed(false);

    try {
      const room = await createRoom(apiUrl, name.trim());
      storeToken(room.code, room.token);
      router.push(`/r/${room.code}`);
    } catch {
      setCreateFailed(true);
      setCreating(false);
    }
  }

  /** The fallback path, for a player who was read the code aloud. */
  function join(event: React.FormEvent) {
    event.preventDefault();
    router.push(`/r/${code.trim().toUpperCase()}`);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <form onSubmit={create} className="flex flex-col gap-3">
        <h2 className="font-semibold">Start a room</h2>
        <label className="flex flex-col gap-1">
          Your name
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            required
            className="rounded border border-neutral-700 bg-neutral-900 p-2"
          />
        </label>
        <button type="submit" disabled={creating || name.trim() === ''}>
          {creating ? 'Creating…' : 'Create a room'}
        </button>
        {createFailed && <p role="alert">Could not create a room.</p>}
      </form>

      <form onSubmit={join} className="flex flex-col gap-3">
        <h2 className="font-semibold">Join with a code</h2>
        <label className="flex flex-col gap-1">
          Room code
          <input
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            className="rounded border border-neutral-700 bg-neutral-900 p-2 tracking-widest uppercase"
          />
        </label>
        <button type="submit" disabled={code.trim().length !== 4}>
          Join
        </button>
      </form>
    </div>
  );
}
