import confetti from 'canvas-confetti';
import { beforeEach, vi } from 'vitest';
import { FakeEventSource } from './fake-event-source';
import { FakeWakeLock } from './fake-wake-lock';

/**
 * `canvas-confetti` draws on a real 2D context, and jsdom implements no
 * `getContext` at all — so the real module cannot run in this environment. What
 * the tests are about is *whether* a burst was fired and how loud, which is
 * exactly what a mock records.
 */
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

/**
 * Node 26 exposes a global `localStorage` that is undefined unless the process
 * was started with `--localstorage-file`, and under vitest's jsdom environment
 * `window` is the global object — so that undefined shadows the storage jsdom
 * would otherwise provide. The app stores the player token there (D11), so the
 * tests need a real one. Same semantics as jsdom's: string keys, string values.
 */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value));
  }
}

if (globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
}

/**
 * jsdom implements no `ResizeObserver`, and the card uses one to re-fit its cell text
 * whenever the card's own width changes. A stub that observes nothing is the right
 * shape rather than a shim that fires: jsdom lays nothing out, so every box it would
 * report is zero and a resize it invented would be measuring nothing. Whether a cell
 * fits is the gate's question, not this environment's.
 */
if (globalThis.ResizeObserver === undefined) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
}

/**
 * jsdom implements no `Range.getClientRects` either, and the card measures cell
 * overflow with one — a `Range` over the painted line boxes, because `scrollWidth`
 * under-reports on a centred flex line and is what hid #47 three times.
 *
 * An empty list is the truthful answer from an environment that paints nothing: no
 * line boxes, so no line box is outside its cell, so nothing is shrunk. The card
 * renders here at its full type size and the gate is what checks whether it fits.
 */
if (Range.prototype.getClientRects === undefined) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
}

/**
 * jsdom 30 ships no `matchMedia` at all, and the confetti asks it whether the
 * device has been told to keep motion down before it fires — so without this the
 * *first* prize of any test run throws rather than celebrating. Nothing matches,
 * which is the truthful answer from an environment with no display preferences;
 * a test that is about reduced motion says so by spying on this.
 */
if (globalThis.matchMedia === undefined) {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  });
}

// Installed once, for the whole file, and never stubbed: see the note on the
// class. Only the record of what was opened is per-test.
Object.defineProperty(globalThis, 'EventSource', {
  configurable: true,
  value: FakeEventSource,
});

// Same again, and for the same recorded reason — see the note on the class.
Object.defineProperty(navigator, 'wakeLock', {
  configurable: true,
  value: new FakeWakeLock(),
});

beforeEach(() => {
  FakeEventSource.opened = [];
  FakeWakeLock.requested = [];
  FakeWakeLock.refuse = false;
  vi.mocked(confetti).mockClear();
});
