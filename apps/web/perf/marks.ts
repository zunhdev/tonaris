// What the perf page measures, read by the Playwright perf suite through `window.perf`: plain timers from an
// action (a click, Enter) to the render that shows its result.

export type Sample = { kind: string; ms: number };

const samples: Sample[] = [];
const started = new Map<string, number>();
/** Wall-clock times, for comparing two pages: when an edit was made, and when each value was first shown. */
const madeAt = new Map<string, number>();
const shownAt = new Map<string, number>();

export const perf = {
  samples,
  madeAt,
  shownAt,
  begin(key: string, at: number = performance.now()): void {
    started.set(key, at);
  },
  /** Ends `key` if it was started, and records it as `kind`. */
  end(key: string, kind: string): void {
    const at = started.get(key);
    if (at === undefined) return;
    started.delete(key);
    samples.push({ kind, ms: performance.now() - at });
  },
};

declare global {
  interface Window {
    perf: typeof perf & {
      /** Times `count` fresh bootstraps, as a viewer's refetch of a shared collection would do. */
      refetch(count: number): Promise<number[]>;
    };
  }
}
