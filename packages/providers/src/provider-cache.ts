// Where provider answers are kept for a while (TS-41): MusicBrainz's and the Cover Art Archive's for 7 days. The
// API keeps them in Postgres (`providerCache` in packages/db); tests and tooling keep them in memory. Keys are
// namespaced by provider, such as `musicbrainz:url:{url}`, and values are JSON objects or arrays.

export type ProviderCache = {
  /** The entries among `keys` that haven't expired by `now`. */
  get(keys: readonly string[], now: Date): Promise<Map<string, unknown>>;
  /** Keeps `entries` until `expiresAt`, replacing what is kept under their keys. */
  set(entries: readonly { key: string; value: unknown }[], expiresAt: Date): Promise<void>;
};

/** A cache in this process's memory, for tests and tooling. */
export function memoryCache(): ProviderCache & {
  size(): number;
  /** Everything kept, expired or not: for tests that check what a lookup left behind. */
  entries(): [string, unknown][];
} {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async get(keys, now) {
      const found = new Map<string, unknown>();
      for (const key of keys) {
        const entry = entries.get(key);
        if (entry && entry.expiresAt > now.getTime()) found.set(key, entry.value);
      }
      return found;
    },
    async set(kept, expiresAt) {
      for (const { key, value } of kept) {
        entries.set(key, { value: structuredClone(value), expiresAt: expiresAt.getTime() });
      }
    },
    size: () => entries.size,
    entries: () => [...entries].map(([key, { value }]) => [key, value]),
  };
}

/**
 * A provider didn't answer usefully in time: busy, unreachable or broken. The work that asked can be retried
 * later (TS-90), and the outcome is `provider_unavailable` (TS-27). Messages name no query (TS-41).
 */
export class ProviderUnavailableError extends Error {
  override name = "ProviderUnavailableError";
  constructor(
    readonly provider:
      | "musicbrainz"
      | "coverartarchive"
      | "itunes"
      | "spotify"
      | "qobuz"
      | "tidal"
      | "youtube",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
