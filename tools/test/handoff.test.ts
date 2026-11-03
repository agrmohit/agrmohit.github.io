import { describe, expect, it } from "bun:test";
import { tabStorage, takeHandoff, writeHandoff } from "../../assets/earthrise/handoff.js";

/** A sessionStorage stand-in. */
class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();
  get length(): number {
    return this.#items.size;
  }
  clear(): void {
    this.#items.clear();
  }
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.#items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }
}

const KEY = "earthrise:handoff";
const NOW = 1_800_000_000_000;
const MOMENT = { date: 1_799_999_000_000, progress: 0.42 };

interface Stored {
  at?: number | string;
  date?: number | string;
  progress?: number | string;
}

/** A storage holding this exact value under the handoff's key. */
function holding(value: string): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(KEY, value);
  return storage;
}

/** A storage holding a handoff in handoff.js's format, with any field left out. */
const stored = ({ at, date, progress }: Stored): MemoryStorage =>
  holding([at, date, progress].filter((field) => field !== undefined).join(" "));

describe("takeHandoff", () => {
  interface Row {
    name: string;
    storage: Storage | null;
    want: typeof MOMENT | null;
  }
  const fresh = { at: NOW - 600, ...MOMENT };
  const rows: readonly Row[] = [
    { name: "a fresh handoff", storage: stored(fresh), want: MOMENT },
    { name: "the start of a pass", storage: stored({ ...fresh, progress: 0 }), want: { ...MOMENT, progress: 0 } },
    { name: "the end of a pass", storage: stored({ ...fresh, progress: 1 }), want: { ...MOMENT, progress: 1 } },
    { name: "written this instant", storage: stored({ ...fresh, at: NOW }), want: MOMENT },
    { name: "exactly 5 s old", storage: stored({ ...fresh, at: NOW - 5000 }), want: MOMENT },
    { name: "older than 5 s", storage: stored({ ...fresh, at: NOW - 5001 }), want: null },
    { name: "from the future (clock change)", storage: stored({ ...fresh, at: NOW + 1 }), want: null },
    { name: "nothing stored", storage: new MemoryStorage(), want: null },
    { name: "storage blocked", storage: null, want: null },
    { name: "no date", storage: stored({ at: NOW, progress: 0.4 }), want: null },
    { name: "a progress that is not a number", storage: stored({ ...fresh, progress: "abc" }), want: null },
    { name: "an extra field", storage: holding(`${NOW} ${MOMENT.date} ${MOMENT.progress} 7`), want: null },
    { name: "a time stamp that is not a number", storage: stored({ ...fresh, at: "abc" }), want: null },
    { name: "a date that is not a number", storage: stored({ ...fresh, date: "abc" }), want: null },
    { name: "an infinite date", storage: stored({ ...fresh, date: "Infinity" }), want: null },
    // Number("") is 0: an empty date would read as 1970
    { name: "an empty date", storage: holding(`${NOW}  ${MOMENT.progress}`), want: null },
    { name: "an empty progress", storage: holding(`${NOW} ${MOMENT.date} `), want: null },
    { name: "progress past the end of the pass", storage: stored({ ...fresh, progress: 1.01 }), want: null },
    { name: "progress before the start of the pass", storage: stored({ ...fresh, progress: -0.01 }), want: null },
    { name: "garbage", storage: holding("not a handoff"), want: null },
    { name: "an empty value", storage: holding(""), want: null },
  ];

  it.each(rows)("$name", ({ storage, want }) => {
    expect(takeHandoff(storage, NOW)).toEqual(want);
  });
});

describe("takeHandoff uses the handoff up", () => {
  interface Row {
    name: string;
    at: number;
  }
  const rows: readonly Row[] = [
    { name: "when it is fresh", at: NOW },
    // a stale handoff must not wait for a later visit
    { name: "when it is stale", at: NOW - 60_000 },
  ];

  it.each(rows)("$name", ({ at }) => {
    const storage = stored({ at, ...MOMENT });
    takeHandoff(storage, NOW);
    expect(storage.getItem(KEY)).toBeNull();
  });
});

describe("takeHandoff leaves the tab's other keys alone", () => {
  interface Row {
    name: string;
    handoff: string | null;
  }
  const rows: readonly Row[] = [
    { name: "with a fresh handoff", handoff: `${NOW} ${MOMENT.date} ${MOMENT.progress}` },
    { name: "with a stale handoff", handoff: `${NOW - 60_000} ${MOMENT.date} ${MOMENT.progress}` },
    { name: "with none", handoff: null },
  ];

  // the tab's storage is shared with anything else the site keeps there
  it.each(rows)("$name", ({ handoff }) => {
    const storage = new MemoryStorage();
    storage.setItem("another:key", "kept");
    if (handoff !== null) storage.setItem(KEY, handoff);
    takeHandoff(storage, NOW);
    expect(storage.getItem("another:key")).toBe("kept");
  });
});

describe("writeHandoff", () => {
  interface Row {
    name: string;
    storage: Storage | null;
    moments: readonly (typeof MOMENT)[];
    want: typeof MOMENT | null;
  }
  const later = { date: MOMENT.date + 60_000, progress: 0.9 };
  const rows: readonly Row[] = [
    { name: "one write", storage: new MemoryStorage(), moments: [MOMENT], want: MOMENT },
    {
      name: "the start of a pass",
      storage: new MemoryStorage(),
      moments: [{ ...MOMENT, progress: 0 }],
      want: { ...MOMENT, progress: 0 },
    },
    // a page hidden twice (bfcache, then discarded) writes twice: the later one wins
    { name: "two writes", storage: new MemoryStorage(), moments: [MOMENT, later], want: later },
    { name: "storage blocked", storage: null, moments: [MOMENT], want: null },
  ];

  it.each(rows)("$name, read back", ({ storage, moments, want }) => {
    for (const moment of moments) writeHandoff(storage, moment, NOW);
    expect(takeHandoff(storage, NOW + 100)).toEqual(want);
  });
});

/** A window whose sessionStorage getter returns `storage`, or throws `error`. */
function windowWith(storage: Storage, error: Error | null): { readonly sessionStorage: Storage } {
  return {
    get sessionStorage(): Storage {
      if (error) throw error;
      return storage;
    },
  };
}

describe("tabStorage returns", () => {
  interface Row {
    name: string;
    error: Error | null;
    want: "the storage" | "null";
  }
  const rows: readonly Row[] = [
    { name: "the storage when it is allowed", error: null, want: "the storage" },
    // what Chrome throws with "block all cookies and site data"
    {
      name: "null when site data is blocked",
      error: new DOMException("The operation is insecure.", "SecurityError"),
      want: "null",
    },
  ];

  it.each(rows)("$name", ({ error, want }) => {
    const storage = new MemoryStorage();
    expect(tabStorage(windowWith(storage, error))).toBe(want === "the storage" ? storage : null);
  });
});

describe("tabStorage rethrows", () => {
  interface Row {
    name: string;
    error: Error;
  }
  const rows: readonly Row[] = [
    { name: "another DOMException", error: new DOMException("quota", "QuotaExceededError") },
    { name: "an error that is not a DOMException", error: new TypeError("broken") },
  ];

  it.each(rows)("$name, unchanged", ({ error }) => {
    expect(() => tabStorage(windowWith(new MemoryStorage(), error))).toThrow(error);
  });
});
