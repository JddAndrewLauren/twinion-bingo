import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Db } from '../db/client.js';
import { normalizeRoomCode } from './codes.js';
import { parseLastEventId, readEventsAfter, roomExists } from './events.js';

/**
 * Overridable only so the tests can watch a heartbeat without waiting half a
 * minute for one.
 */
export type StreamTimings = {
  /** How often the log is checked for rows after the cursor. */
  pollMs: number;
  /** How often a `:ping` comment goes out, idle or not. */
  pingMs: number;
};

export const DEFAULT_STREAM_TIMINGS: StreamTimings = {
  pollMs: 1000,
  pingMs: 25_000,
};

/**
 * The realtime spine. One stream per device, room-scoped rather than
 * game-scoped, with `room_events.seq` as the SSE event id — so a device that
 * slept through twenty minutes reconnects with `Last-Event-ID` and gets back
 * precisely the rows it missed, and a device connecting for the first time gets
 * the whole log and converges on the same state.
 *
 * The log is polled rather than listened to: a Fly machine can stop mid-race
 * and a room can outlive several of them, so the cursor has to live in the
 * request rather than in any process's memory. At one query per device per
 * second for a room of six, that is nothing.
 */
export function createStreamRoutes(
  db: Db,
  timings: Partial<StreamTimings> = {},
) {
  const { pollMs, pingMs } = { ...DEFAULT_STREAM_TIMINGS, ...timings };
  const routes = new Hono();

  routes.get('/rooms/:code/stream', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'));
    if (code === undefined) return c.json({ error: 'not a room code' }, 400);

    if (!(await roomExists(db, code))) {
      return c.json({ error: 'no room with that code' }, 404);
    }

    const from = parseLastEventId(c.req.header('last-event-id'));

    return streamSSE(c, async (stream) => {
      let cursor = from;
      let pingDue = Date.now() + pingMs;

      while (!stream.closed && !stream.aborted) {
        for (const event of await readEventsAfter(db, code, cursor)) {
          await stream.writeSSE({
            // Unnamed on purpose: every consumer wants every row in order, and
            // `kind` is in the payload for the ones that care which it is.
            id: String(event.seq),
            data: JSON.stringify(event),
          });
          cursor = event.seq;
        }

        if (Date.now() >= pingDue) {
          // A comment, not an event: it keeps proxies and Fly's idle timeout
          // from closing a quiet room without disturbing the cursor.
          await stream.write(': ping\n\n');
          pingDue = Date.now() + pingMs;
        }

        await stream.sleep(pollMs);
      }
    });
  });

  return routes;
}
