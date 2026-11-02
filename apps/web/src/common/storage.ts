// Browser storage, guarded (DS-27, DS-90, TS-74): localStorage and the tab's sessionStorage can be missing, as on the
// server, or refuse reads and writes, as in private modes or with storage blocked. Then nothing is kept and nothing
// fails: a read finds nothing, and a write is skipped. Each call takes the store to use, so tests give their own.

/** The browser's localStorage, or the tab's sessionStorage with `session`; undefined where it can't be reached. */
export function storageOf(session = false): Storage | undefined {
  try {
    return session ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The text kept under `key`; undefined when there is none, or it can't be read. */
export function readText(key: string, store = storageOf()): string | undefined {
  try {
    return store?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Keeps `text` under `key`, if the store takes it. */
export function writeText(key: string, text: string, store = storageOf()): void {
  try {
    store?.setItem(key, text);
  } catch {
    // Not kept; nothing else changes.
  }
}

/** Forgets what is kept under `key`. */
export function forget(key: string, store = storageOf()): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

/** The value kept as JSON under `key`; undefined when there is none, or it can't be read or parsed. */
export function readJson(key: string, store = storageOf()): unknown {
  const text = readText(key, store);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Keeps `value` as JSON under `key`, if the store takes it. */
export function writeJson(key: string, value: unknown, store = storageOf()): void {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return;
  }
  writeText(key, text, store);
}
