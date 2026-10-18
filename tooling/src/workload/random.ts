// A seeded random source for the workload generator: the same seed yields the same workload, IDs included,
// so measurements on different machines and runs compare like with like (TS-120).

/** FNV-1a, to turn a label into a 32-bit seed. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** `items[index]`, which must exist. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`No item at ${index} of ${items.length}`);
  return item;
}

const hex = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function formatUuid(bytes: Uint8Array): string {
  const h = Array.from(bytes, (byte) => hex[byte]).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** mulberry32: small, fast and plenty for test data. Not for secrets. */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** An independent stream for one part of the workload, so changing one part leaves the others as they were. */
  derive(label: string): Random {
    return new Random(hash(`${this.state}:${label}`));
  }

  uint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    return this.uint32() / 2 ** 32;
  }

  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return at(items, Math.floor(this.next() * items.length));
  }

  /** Picks from `items`, favoring the first ones: a higher `skew` concentrates picks at the front. */
  pickSkewed<T>(items: readonly T[], skew: number): T {
    return at(items, Math.floor(this.next() ** skew * items.length));
  }

  /** An index into `weights`, chosen in proportion to them. */
  weighted(weights: readonly number[]): number {
    let remaining = this.next() * weights.reduce((sum, weight) => sum + weight, 0);
    for (const [index, weight] of weights.entries()) {
      remaining -= weight;
      if (remaining < 0) return index;
    }
    return weights.length - 1;
  }

  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    return at(items, this.weighted(weights));
  }

  /** A shuffled copy. */
  shuffle<T>(items: readonly T[]): T[] {
    return items
      .map((item) => ({ item, key: this.next() }))
      .toSorted((a, b) => a.key - b.key)
      .map(({ item }) => item);
  }

  bytes(length: number): Uint8Array {
    return Uint8Array.from({ length }, () => this.uint32() & 0xff);
  }

  /** A UUIDv7 (TS-10) for an entity created at `ms`, so IDs sort by creation time as the app's do. */
  uuidv7(ms: number): string {
    const time = new Uint8Array(6);
    let rest = ms;
    for (let i = 5; i >= 0; i--) {
      time[i] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    return this.uuid(7, time);
  }

  /** A UUIDv4, the shape of MusicBrainz IDs. */
  uuidv4(): string {
    return this.uuid(4);
  }

  /** Random bytes after `prefix`, with the version nibble and the RFC 9562 variant bits set. */
  private uuid(version: number, prefix = new Uint8Array()): string {
    const bytes = this.bytes(16);
    bytes.set(prefix);
    bytes[6] = (version << 4) | (this.uint32() & 0x0f);
    bytes[8] = 0x80 | (this.uint32() & 0x3f);
    return formatUuid(bytes);
  }

  /** `length` characters drawn from `alphabet`. */
  string(alphabet: string, length: number): string {
    let result = "";
    for (let i = 0; i < length; i++) result += alphabet[this.uint32() % alphabet.length];
    return result;
  }
}
