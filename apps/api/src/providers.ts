// The metadata sources the API asks (TS-41, TS-103), made once per process: MusicBrainz's 1 request a second and
// iTunes Lookup's 20 a minute hold for every capture only while there is one client of each. The capture command
// (TON-44, TON-45) identifies links with `identifier`.

import { providerCacheStore, type Database } from "@tonaris/db";
import {
  createIdentifier,
  ItunesLookup,
  MusicBrainz,
  Spotify,
  StorePages,
} from "@tonaris/providers";

import type { ApiConfig } from "./config";

export function createProviders(config: Pick<ApiConfig, "spotify">, db: Database) {
  const cache = providerCacheStore(db);
  const spotify = config.spotify ? new Spotify(config.spotify) : undefined;
  const musicBrainz = new MusicBrainz({ cache });
  return {
    musicBrainz,
    spotify,
    identifier: createIdentifier({
      musicBrainz,
      itunes: new ItunesLookup({ cache }),
      pages: new StorePages({ cache }),
      spotify,
    }),
  };
}

export type Providers = ReturnType<typeof createProviders>;
