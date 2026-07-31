import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { EventStream } from '../src/sim/client.js';

/**
 * The half of the simulator that holds a socket, tested against a real one.
 *
 * `--sweep` claims twenty connections were held for the whole replay, and that
 * claim is only worth anything if the run waited for them: a stream still inside
 * its `fetch` when the game starts replays the whole log the moment it connects
 * and ends up with a buffer indistinguishable from one that was there all along.
 * So what matters here is precisely *when* `ready()` settles, which is why the
 * server below answers on command rather than on a timer.
 */

/** An SSE endpoint that responds only when the test says so. */
function stubStream(): {
  url: Promise<string>;
  respond: (status?: number) => Promise<void>;
  send: (seq: number) => void;
  close: () => Promise<void>;
} {
  let held: ServerResponse | undefined;
  let arrived = (): void => {};
  const request = new Promise<void>((resolve) => {
    arrived = resolve;
  });

  const server: Server = createServer((_, response) => {
    held = response;
    arrived();
  });

  const listening = new Promise<string>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });

  return {
    url: listening,
    respond: async (status = 200) => {
      await request;
      held?.writeHead(status, { 'content-type': 'text/event-stream' });
      // Flushed, so the client's `fetch` actually resolves its headers.
      held?.write(': ping\n\n');
    },
    send: (seq: number) => {
      held?.write(
        `id: ${seq}\ndata: ${JSON.stringify({
          seq,
          kind: 'CALL',
          gameId: 'game',
          squareId: 'sq',
          actorPlayerId: 'p0',
          targetSeq: null,
          prizeKind: null,
        })}\n\n`,
      );
    },
    close: async () => {
      held?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Long enough for anything already scheduled to have run. */
const settlePoint = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

describe('a simulator event stream', () => {
  let stub: ReturnType<typeof stubStream> | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  it('is not ready until the SSE response is in', async () => {
    stub = stubStream();
    const stream = new EventStream(await stub.url, 'ABCD', 'spectator');

    stream.open();
    let ready = false;
    void stream.ready().then(() => {
      ready = true;
    });

    // The server has not answered, so a run that trusted `open()` alone would be
    // starting the game right here with nobody connected.
    await settlePoint();
    expect(ready).toBe(false);

    await stub.respond();
    await stream.ready();
    expect(ready).toBe(true);
    expect(stream.failure).toBeUndefined();

    stream.close();
  });

  it('takes the rows the server sends once it is ready', async () => {
    stub = stubStream();
    const stream = new EventStream(await stub.url, 'ABCD', 'spectator');

    stream.open();
    await stub.respond();
    await stream.ready();

    stub.send(7);
    await settlePoint();

    expect(stream.events.map((event) => event.seq)).toEqual([7]);
    expect(stream.lastSeq).toBe(7);

    stream.close();
  });

  /** A refused stream has to settle too, or the run waits out the race. */
  it('is ready, and failed, when the stream is refused', async () => {
    stub = stubStream();
    const stream = new EventStream(await stub.url, 'ABCD', 'spectator');

    stream.open();
    await stub.respond(404);
    await stream.ready();

    expect(String(stream.failure)).toContain('404');
  });
});
