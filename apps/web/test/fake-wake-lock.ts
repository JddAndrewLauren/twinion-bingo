/**
 * jsdom ships no `navigator.wakeLock`, and the room screen asks for one as soon as
 * a game goes live. This one records what was requested and lets a test read
 * whether the lock is still held, which is how the "the screen stays awake" cases
 * stand in for a phone that would otherwise dim.
 *
 * It is installed on `navigator` by `setup.ts` rather than by a per-test
 * `vi.stubGlobal`, for the same recorded reason `FakeEventSource` is: the acquire
 * is a promise, and it can settle *after* a test body returns — a game that goes
 * live on the last line of a test resolves its sentinel in the next test's tick.
 * A stub pulled out from under that is a `TypeError` in whichever test happened to
 * be running at the time. Only the record of what was requested is per-test.
 */
export class FakeWakeLockSentinel extends EventTarget {
  released = false;

  constructor(readonly type: string) {
    super();
  }

  async release(): Promise<void> {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }

  /**
   * The OS taking the lock back on its own — a call, a low battery. The browser
   * fires `release` without the page having asked, and the reference the page is
   * holding is dead from then on.
   */
  takeBack(): void {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

export class FakeWakeLock {
  static requested: FakeWakeLockSentinel[] = [];
  /** Set by a test to make the next request fail, as a hidden document does. */
  static refuse = false;

  async request(type: string): Promise<FakeWakeLockSentinel> {
    if (FakeWakeLock.refuse) {
      throw new DOMException('refused', 'NotAllowedError');
    }

    const sentinel = new FakeWakeLockSentinel(type);
    FakeWakeLock.requested.push(sentinel);

    return sentinel;
  }

  /** The sentinel a test cares about: the one most recently handed out. */
  static get held(): FakeWakeLockSentinel | undefined {
    return FakeWakeLock.requested.at(-1);
  }
}
