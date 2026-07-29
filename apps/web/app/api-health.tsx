'use client';

import { useEffect, useState } from 'react';

/**
 * One attempt's budget. Fly runs the API with `auto_stop_machines = "stop"` and
 * `min_machines_running = 0`, so the first request of a session pays a cold
 * start: long enough to let a machine boot and answer, short enough that a hung
 * request stops reading as "still waiting".
 */
const ATTEMPT_TIMEOUT_MS = 5000;

/**
 * Two attempts, because the natural response to a cold start is one retry
 * rather than a dead end. Only a transport failure is retried — a reply, even a
 * 500, is the API answering, and asking twice will not change it.
 */
const ATTEMPTS = 2;

type Health =
  | { state: 'checking' }
  /** Whatever the API called itself, rather than a value this component picked. */
  | { state: 'ok'; reported: string }
  | { state: 'failing'; detail: string }
  | { state: 'timed out' }
  | { state: 'unreachable' };

export function ApiHealth({ apiUrl }: { apiUrl: string }) {
  const [health, setHealth] = useState<Health>({ state: 'checking' });

  useEffect(() => {
    let unmounted = false;
    let inFlight: AbortController | undefined;

    async function probeOnce(): Promise<Health> {
      const controller = new AbortController();
      inFlight = controller;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ATTEMPT_TIMEOUT_MS);

      try {
        const res = await fetch(`${apiUrl}/health`, {
          signal: controller.signal,
        });

        if (!res.ok) return { state: 'failing', detail: `error ${res.status}` };

        const reported = await readStatus(res);
        return reported === undefined
          ? { state: 'failing', detail: 'bad reply' }
          : { state: 'ok', reported };
      } catch {
        return timedOut ? { state: 'timed out' } : { state: 'unreachable' };
      } finally {
        clearTimeout(timer);
      }
    }

    void (async () => {
      let last: Health = { state: 'unreachable' };

      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        last = await probeOnce();
        if (unmounted) return;
        if (last.state !== 'unreachable' && last.state !== 'timed out') break;
      }

      setHealth(last);
    })();

    return () => {
      unmounted = true;
      inFlight?.abort();
    };
  }, [apiUrl]);

  return <p>API: {describe(health)}</p>;
}

function describe(health: Health): string {
  switch (health.state) {
    case 'checking':
      return 'checking…';
    case 'ok':
      return health.reported;
    case 'failing':
      return health.detail;
    default:
      return health.state;
  }
}

/**
 * Never throws. A 2xx whose body is not the health JSON is the API misbehaving,
 * not the network failing, and `undefined` is not a status worth rendering.
 */
async function readStatus(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const status = (body as { status?: unknown }).status;
    return typeof status === 'string' ? status : undefined;
  } catch {
    return undefined;
  }
}
