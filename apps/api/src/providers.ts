// The metadata sources the API asks (TS-41, TS-103), made once per process: MusicBrainz's 1 request a second and
// iTunes Lookup's 20 a minute hold for every capture only while there is one client of each. `album.capture` asks
// through `capture` (TON-44), and Find artwork searches with `covers` (TON-112). `enrich` is TS-42's enrichment of a
// saved album, for the capture job's retries: that job isn't built yet, so nothing calls it.

import {
  albumReleaseGroup,
  enrichAlbum,
  providerCacheStore,
  type Database,
  type Enrichment,
} from "@tonaris/db";
import { failure, type Failure } from "@tonaris/domain";
import {
  createIdentifier,
  describeAlbum,
  findCovers,
  ItunesLookup,
  MusicBrainz,
  Spotify,
  StorePages,
  YouTubeData,
} from "@tonaris/providers";

import type { CaptureDeps } from "./capture";
import type { ApiConfig } from "./config";
import { log } from "./observability";
import type { SyncHub } from "./sync/hub";

/**
 * Enrichment of a saved album, for a retry or a newly matched link (TS-42, TS-44): what MusicBrainz now says about
 * the release group the album is saved as, applied under the owner's write lock, and published to the owner's
 * sessions. An album with no release group has nothing to enrich from. MusicBrainz's unavailability propagates as
 * `ProviderUnavailableError`, with nothing written, so the capture's job retries (TS-90).
 */
export function createEnricher({
  db,
  musicBrainz,
  hub,
}: {
  db: Database;
  musicBrainz: MusicBrainz;
  hub: Pick<SyncHub, "publish">;
}) {
  return async function enrich(
    accountId: string,
    albumId: string,
  ): Promise<Enrichment | Failure | undefined> {
    const releaseGroupId = await albumReleaseGroup(db, accountId, albumId);
    if (releaseGroupId === undefined) return failure("not_found", "This album doesn't exist.");
    if (releaseGroupId === null) return undefined;
    const facts = await describeAlbum(musicBrainz, releaseGroupId);
    const enriched = await enrichAlbum(db, accountId, albumId, facts);
    if (enriched.status === "applied") hub.publish(accountId, enriched.changes);
    return enriched;
  };
}

export function createProviders(
  config: Pick<ApiConfig, "spotify" | "youtubeApiKey">,
  db: Database,
  hub: Pick<SyncHub, "publish">,
) {
  const cache = providerCacheStore(db);
  const spotify = config.spotify ? new Spotify(config.spotify) : undefined;
  // A refused read is a used-up quota or a bad key: the creator's to fix, so it is logged as an error (TS-105).
  const youtube = config.youtubeApiKey
    ? new YouTubeData({
        apiKey: config.youtubeApiKey,
        onRefused: (read, status, reason) =>
          log("error", "The YouTube Data API refused a read", { read, status, reason }),
      })
    : undefined;
  const musicBrainz = new MusicBrainz({ cache });
  const identifier = createIdentifier({
    musicBrainz,
    itunes: new ItunesLookup({ cache }),
    pages: new StorePages({ cache }),
    spotify,
    youtube,
  });
  const capture: CaptureDeps = {
    identify: identifier.identify,
    matchDetails: identifier.matchDetails,
    describe: (releaseGroupId) => describeAlbum(musicBrainz, releaseGroupId),
  };
  return {
    musicBrainz,
    spotify,
    capture,
    covers: (query: { title: string; artist: string }) => findCovers(musicBrainz, query),
    enrich: createEnricher({ db, musicBrainz, hub }),
  };
}

export type Providers = ReturnType<typeof createProviders>;
