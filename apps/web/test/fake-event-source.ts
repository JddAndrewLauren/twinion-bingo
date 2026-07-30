/**
 * jsdom ships no `EventSource`, and the room screen opens one as soon as the
 * roster loads. This one records what was opened and lets a test push a frame
 * down it, which is how the live-roster cases stand in for a second phone.
 *
 * It is installed on `globalThis` by `setup.ts` rather than by a per-test
 * `vi.stubGlobal`, because the screen's stream effect can flush *after* a test
 * body returns — a roster that resolves late opens a stream late. An
 * `afterEach` running `vi.unstubAllGlobals()` would have pulled the constructor
 * out from under that effect, which is a `ReferenceError: EventSource is not
 * defined` in whichever test happened to be running next.
 */
export class FakeEventSource {
  static opened: FakeEventSource[] = [];

  private listeners: ((event: MessageEvent) => void)[] = [];
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === 'message') this.listeners.push(listener);
  }

  close() {
    this.closed = true;
  }

  emit(event: {
    seq: number;
    kind: string;
    actorPlayerId?: string;
    squareId?: string | null;
    prizeKind?: string | null;
  }) {
    const message = new MessageEvent('message', { data: JSON.stringify(event) });
    for (const listener of this.listeners) listener(message);
  }
}
