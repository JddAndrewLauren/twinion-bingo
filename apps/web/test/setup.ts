import { beforeEach } from 'vitest';
import { FakeEventSource } from './fake-event-source';

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

// Installed once, for the whole file, and never stubbed: see the note on the
// class. Only the record of what was opened is per-test.
Object.defineProperty(globalThis, 'EventSource', {
  configurable: true,
  value: FakeEventSource,
});

beforeEach(() => {
  FakeEventSource.opened = [];
});
