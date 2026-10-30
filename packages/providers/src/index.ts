// Public entry point of @tonaris/providers: link parsing, the outbound fetch, metadata sources and their policy
// (TS-15, TS-40, TS-41, TS-103).

export { isPublicAddress } from "./addresses";
export { classify, describeAlbum, recordingYears, type Classification } from "./album-facts";
export { findCovers, maxCovers, type Cover } from "./covers";
export { cleanTitle, matchHints, type Candidate, type HintMatch, type Hints } from "./hints";
export {
  createIdentifier,
  identificationOutcome,
  unidentifiedReasons,
  type AgentDetails,
  type AlbumCandidate,
  type Identification,
  type IdentifierDeps,
  type Identifier,
  type IdentifyContext,
  type Prefill,
} from "./identify";
export {
  ItunesLookup,
  itunesCacheMs,
  itunesIntervalMs,
  type AppleAlbum,
  type ItunesOptions,
} from "./itunes";
export { barcodeForms, urlForms } from "./link-forms";
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
export {
  filterFields,
  policy,
  policyVersion,
  withheld,
  type PolicyFlags,
  type PolicyUse,
  type Withheld,
} from "./policy";
export { memoryCache, ProviderUnavailableError, type ProviderCache } from "./provider-cache";
export { PacedQueue, realClock, type Clock } from "./paced-queue";
export { Spotify, type SpotifyOptions } from "./spotify";
export {
  StorePages,
  robotsAllows,
  extractQobuzHints,
  extractTidalHints,
  type StorePagesOptions,
} from "./store-pages";
export {
  maxLinkLength,
  maxShortLinkHops,
  parseLink,
  readLink,
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
