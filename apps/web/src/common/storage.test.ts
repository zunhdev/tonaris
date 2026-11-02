// Guarded browser storage: what is kept reads back, and storage that is missing or refuses fails nothing.

import { describe, expect, test } from "bun:test";

import { forget, readJson, readText, writeJson, writeText } from "./storage";

class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  clear() {
    this.#items.clear();
  }
  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#items.delete(key);
  }
  setItem(key: string, value: string) {
    this.#items.set(key, value);
  }
}

/** Storage that refuses everything, as a blocked one does. */
class RefusingStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new DOMException("Blocked", "SecurityError");
  }
  override setItem(): void {
    throw new DOMException("Full", "QuotaExceededError");
  }
  override removeItem(): void {
    throw new DOMException("Blocked", "SecurityError");
  }
}

describe("storage", () => {
  test("text and JSON read back as kept, and forgetting removes them", () => {
    const store = new MemoryStorage();
    writeText("a", "token", store);
    writeJson("b", { width: 380 }, store);
    expect(readText("a", store)).toBe("token");
    expect(readJson("b", store)).toEqual({ width: 380 });
    forget("a", store);
    expect(readText("a", store)).toBeUndefined();
  });

  test("nothing kept, or JSON it can't parse, reads as nothing", () => {
    const store = new MemoryStorage();
    store.setItem("b", "{not json");
    expect(readJson("a", store)).toBeUndefined();
    expect(readJson("b", store)).toBeUndefined();
  });

  test("storage that is missing or refuses fails nothing", () => {
    for (const store of [new RefusingStorage(), undefined]) {
      expect(() => writeJson("a", 1, store)).not.toThrow();
      expect(() => forget("a", store)).not.toThrow();
      expect(readJson("a", store)).toBeUndefined();
    }
  });
});
