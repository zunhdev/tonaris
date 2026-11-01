// The services' table (TS-40, TS-41): every host it names parses as its service, and each service's first URL form
// for MusicBrainz is its canonical album URL.

import { describe, expect, test } from "bun:test";

import { streamingServices } from "@tonaris/domain";

import { parseLink } from "./links";
import { services } from "./services";

/** An album id of each service's shape, and the form its canonical URL takes on another of its hosts. */
const albums = {
  spotify: { id: "1KVGLuPtrMrLlyy4Je6df7", path: "/album/1KVGLuPtrMrLlyy4Je6df7" },
  "apple-music": { id: "268443092", path: "/us/album/268443092" },
  qobuz: { id: "mco0vy9isdq4a", path: "/album/mco0vy9isdq4a" },
  tidal: { id: "348182611", path: "/album/348182611" },
  "youtube-music": {
    id: "OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
    path: "/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
  },
} as const;

describe("services (TS-40)", () => {
  test("no host belongs to two services", () => {
    const hosts = streamingServices.flatMap((service) => [
      ...services[service].hosts,
      ...services[service].shortLinkHosts,
    ]);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  test("every service's canonical album URL parses back to itself", () => {
    for (const service of streamingServices) {
      const { id } = albums[service];
      const url = services[service].canonical("album", id);
      expect(parseLink(url)).toMatchObject({ status: "parsed", link: { service, id, url } });
    }
  });

  test("every host parses as its service", () => {
    for (const service of streamingServices) {
      for (const host of services[service].hosts) {
        // Qobuz's store hosts name an album by its slug too.
        const path =
          service === "qobuz" && !host.startsWith("open.") && !host.startsWith("play.")
            ? `/gb-en/album/a-slug/${albums.qobuz.id}`
            : albums[service].path;
        expect(parseLink(`https://${host}${path}`)).toMatchObject({
          status: "parsed",
          link: { service, id: albums[service].id },
        });
      }
      for (const host of services[service].shortLinkHosts) {
        expect(parseLink(`https://${host}/abc`)).toEqual({
          status: "short",
          service,
          url: `https://${host}/abc`,
        });
      }
    }
  });

  test("each service's first MusicBrainz form is its canonical album URL", () => {
    for (const service of streamingServices) {
      const { id } = albums[service];
      const hints = service === "apple-music" ? { storefront: "fi" } : {};
      expect(services[service].forms(id, hints)[0]).toBe(
        services[service].canonical("album", id, hints),
      );
    }
  });

  test("a track's canonical URL keeps what the link says of its album", () => {
    expect(services["apple-music"].canonical("track", "268443097")).toBe(
      "https://music.apple.com/song/268443097",
    );
    expect(
      services["apple-music"].canonical("track", "268443097", {
        storefront: "fi",
        albumId: "268443092",
      }),
    ).toBe("https://music.apple.com/fi/album/268443092?i=268443097");
    expect(
      services["youtube-music"].canonical("track", "dQw4w9WgXcQ", {
        albumId: albums["youtube-music"].id,
      }),
    ).toBe(`https://music.youtube.com${albums["youtube-music"].path}`);
  });
});
