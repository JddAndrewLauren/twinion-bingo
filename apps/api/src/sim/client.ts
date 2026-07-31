import type { CallResult, GameView, RetractResult } from '../games/store.js';
import type { RoomEvent } from '../rooms/events.js';
import type { JoinResult, Player } from '../rooms/store.js';

/** A reply as the sim judges it: the status matters as much as the body. */
export type Reply<T> = { status: number; body: T };

export type ErrorBody = { error: string };

async function request<T>(
  method: string,
  url: string,
  token: string | undefined,
  body?: unknown,
): Promise<Reply<T>> {
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return { status: response.status, body: (await response.json()) as T };
}

/**
 * One headless player: everything a device does over HTTP, minus the screen.
 *
 * A device is two halves — these calls and the stream below — because that is
 * how the real client is built and the interesting failures live in the seam
 * between them.
 */
export class HeadlessPlayer {
  private constructor(
    readonly baseUrl: string,
    readonly code: string,
    readonly token: string,
    readonly player: Player,
    readonly label: string,
  ) {}

  static async host(baseUrl: string, name: string): Promise<HeadlessPlayer> {
    const { status, body } = await request<JoinResult & ErrorBody>(
      'POST',
      `${baseUrl}/rooms`,
      undefined,
      { name },
    );

    if (status !== 201) {
      throw new Error(`POST /rooms answered ${status}: ${body.error}`);
    }

    return new HeadlessPlayer(baseUrl, body.code, body.token, body.player, name);
  }

  static async join(
    baseUrl: string,
    code: string,
    name: string,
  ): Promise<HeadlessPlayer> {
    const { status, body } = await request<JoinResult & ErrorBody>(
      'POST',
      `${baseUrl}/rooms/${code}/join`,
      undefined,
      { name },
    );

    if (status !== 201) {
      throw new Error(`POST /rooms/${code}/join answered ${status}: ${body.error}`);
    }

    return new HeadlessPlayer(baseUrl, code, body.token, body.player, name);
  }

  async startGame(): Promise<GameView> {
    const { status, body } = await request<GameView & ErrorBody>(
      'POST',
      `${this.baseUrl}/rooms/${this.code}/games`,
      this.token,
    );

    if (status !== 201) {
      throw new Error(`starting the game answered ${status}: ${body.error}`);
    }

    return body;
  }

  async game(): Promise<GameView> {
    const { status, body } = await request<GameView & ErrorBody>(
      'GET',
      `${this.baseUrl}/rooms/${this.code}/game`,
      this.token,
    );

    if (status !== 200) {
      throw new Error(`reading the game answered ${status}: ${body.error}`);
    }

    return body;
  }

  /** Not thrown on: a 200 is a lost race and a 409 is a finished game (D5). */
  call(gameId: string, squareId: string): Promise<Reply<CallResult & ErrorBody>> {
    return request<CallResult & ErrorBody>(
      'POST',
      `${this.baseUrl}/games/${gameId}/call`,
      this.token,
      { square_id: squareId },
    );
  }

  retract(gameId: string, seq: number): Promise<Reply<RetractResult & ErrorBody>> {
    return request<RetractResult & ErrorBody>(
      'POST',
      `${this.baseUrl}/games/${gameId}/retract`,
      this.token,
      { seq },
    );
  }
}

/**
 * The other half of a device: one held SSE connection, its buffer, and the
 * cursor it would resume from.
 *
 * The buffer is never trimmed and never deduplicated on the way in, because the
 * questions the sim asks of it are exactly the ones a helpful client library
 * would hide — did a row arrive twice, did the seam after a reconnect skip one,
 * did two devices end up with different logs.
 */
export class EventStream {
  readonly events: RoomEvent[] = [];

  /** Set when the connection died on its own; a dropped stream is a failure. */
  failure: Error | undefined;

  private controller: AbortController | undefined;

  /** The `id` of the last frame, which is what `Last-Event-ID` resumes from. */
  private lastEventId = 0;

  /** Settled once this open's response headers are in, or it failed. */
  private connected: Promise<void> = Promise.resolve();

  constructor(
    private readonly baseUrl: string,
    private readonly code: string,
    readonly label: string,
  ) {}

  get lastSeq(): number {
    return this.lastEventId;
  }

  /**
   * Opens, or re-opens after a drop. A reconnect sends the last id it saw, so
   * the server replays precisely the rows this device missed — the resume path
   * the whole realtime design rests on.
   *
   * Fire-and-forget by design: a device does not block on its socket. `ready()`
   * is how a caller that must not race the connection waits for it.
   */
  open(): void {
    const controller = new AbortController();
    this.controller = controller;

    let settle = (): void => {};
    this.connected = new Promise<void>((resolve) => {
      settle = resolve;
    });

    void this.read(controller, settle).catch((error: unknown) => {
      settle();
      if (controller.signal.aborted) return;
      this.failure = error instanceof Error ? error : new Error(String(error));
    });
  }

  /**
   * Resolves once the SSE response is in — the connection is established, the
   * server is inside the loop that will write to it, and its cursor is fixed —
   * or once the attempt failed, in which case `failure` says so.
   *
   * Without it, `open()` returning proves nothing: a stream still inside its
   * `fetch` when the game starts would replay the backlog on connect and look
   * exactly like one that was there all along, which is the way a concurrency
   * sweep passes without ever having held the connections it claims to.
   */
  async ready(): Promise<void> {
    await this.connected;
  }

  close(): void {
    this.controller?.abort();
    this.controller = undefined;
  }

  private async read(
    controller: AbortController,
    connected: () => void,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/rooms/${this.code}/stream`, {
      headers: {
        accept: 'text/event-stream',
        ...(this.lastEventId > 0
          ? { 'last-event-id': String(this.lastEventId) }
          : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok || response.body === null) {
      throw new Error(`the stream answered ${response.status}`);
    }

    connected();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();

      // The server holds the stream open until the client goes away, so an
      // ended body is the connection being dropped under us.
      if (done) throw new Error('the stream ended on its own');

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        this.take(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  /**
   * One frame. Events are unnamed and `id` is the row's `seq`, so a frame is an
   * id line and a data line; a `: ping` comment is neither and moves no cursor.
   */
  private take(frame: string): void {
    let id: string | undefined;
    let data: string | undefined;

    for (const line of frame.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const separator = line.indexOf(':');
      const field = line.slice(0, separator);
      const value = line.slice(separator + 1).replace(/^ /, '');

      if (field === 'id') id = value;
      if (field === 'data') data = value;
    }

    if (data === undefined) return;

    const event = JSON.parse(data) as RoomEvent;

    if (id !== String(event.seq)) {
      throw new Error(
        `frame id ${String(id)} is not the row's seq ${event.seq}, so ` +
          'Last-Event-ID would resume from the wrong place',
      );
    }

    this.events.push(event);
    this.lastEventId = event.seq;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
