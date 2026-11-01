// Where provider answers are kept for a while (TS-41): the port the providers' clients ask, and the API's Postgres
// store (`providerCacheStore` in packages/db) implements. Keys are namespaced by provider, such as
// `musicbrainz:url:{url}`, and values are JSON objects or arrays.

export type ProviderCache = {
  /** The entries among `keys` that haven't expired by `now`. */
  get(keys: readonly string[], now: Date): Promise<Map<string, unknown>>;
  /** Keeps `entries` until `expiresAt`, replacing what is kept under their keys. */
  set(entries: readonly { key: string; value: unknown }[], expiresAt: Date): Promise<void>;
};
