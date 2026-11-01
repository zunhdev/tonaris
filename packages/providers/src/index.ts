// Public entry point of @tonaris/providers: link parsing, the outbound fetch, metadata sources and their policy
// (TS-15, TS-40, TS-41, TS-103). It exports what the API uses; the package's own tests import its modules directly.

export { describeAlbum } from "./album-facts";
export { findCovers, type Cover } from "./covers";
export { providerNames, ProviderUnavailableError, unavailableFailure } from "./errors";
export {
  createIdentifier,
  identificationOutcome,
  unidentifiedReasons,
  type Identification,
  type Identifier,
} from "./identify";
export { ItunesLookup } from "./itunes";
export { parseLink, readLink, type Fetcher, type LinkParse, type ParsedLink } from "./links";
export { MusicBrainz, providerCacheMs } from "./musicbrainz";
export { filterFields, policy, type PolicyFlags } from "./policy";
export { memoryCache } from "./provider-cache";
export {
  createSafeFetch,
  discard,
  safeFetch,
  SafeFetchError,
  type SafeFetchInit,
} from "./safe-fetch";
export { Spotify } from "./spotify";
export { StorePages } from "./store-pages";
export { YouTubeData } from "./youtube";
