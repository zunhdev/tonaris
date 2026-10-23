// Public entry point of @tonaris/providers: link parsing, the outbound fetch, and metadata sources (TS-40, TS-41,
// TS-103).

export { isPublicAddress } from "./addresses";
export {
  MusicBrainz,
  musicBrainzIntervalMs,
  musicBrainzMaxRetries,
  providerCacheMs,
  type BarcodeRelease,
  type CachePolicy,
  type MusicBrainzEntity,
  type MusicBrainzOptions,
  type UrlTarget,
} from "./musicbrainz";
export { memoryCache, ProviderUnavailableError, type ProviderCache } from "./provider-cache";
export {
  maxLinkLength,
  maxShortLinkHops,
  parseLink,
  resolveShortLink,
  type Fetcher,
  type LinkParse,
  type ParsedLink,
} from "./links";
export {
  connectPinned,
  createSafeFetch,
  safeFetch,
  safeFetchMaxBytes,
  safeFetchMaxRedirects,
  safeFetchTimeoutMs,
  SafeFetchError,
  userAgent,
  type Connect,
  type Resolve,
  type ResolvedAddress,
  type SafeFetchInit,
  type SafeFetchReason,
} from "./safe-fetch";
