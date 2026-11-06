// The metadata sources the API asks (TS-41, TS-103), made once per process: MusicBrainz's 1 request a second and
// iTunes Lookup's 20 a minute hold for every capture only while there is one client of each. `album.capture` asks
// through `capture` (TON-44), and Find artwork searches with `covers` (TON-112). Enrichment (TS-42) happens inside
// the capture command, so there is no separate enricher.

import { providerCacheStore, type Database } from "@tonaris/db";
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

export function createProviders(
  config: Pick<ApiConfig, "spotify" | "youtubeApiKey">,
  db: Database,
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
  };
}

export type Providers = ReturnType<typeof createProviders>;
