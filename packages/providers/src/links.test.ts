// Step 0 of the chain (TS-40): a fixture table of real link variants, the G1 spikes' samples, unsupported and
// hostile input, and short links followed with a scripted fetcher.

import { describe, expect, test } from "bun:test";
import path from "node:path";

import { sameLink, type StreamingService } from "@tonaris/domain";

import { isLinkHost, parseLink, resolveShortLink, type Fetcher, type ParsedLink } from "./links";

function parsed(input: string): ParsedLink {
  const result = parseLink(input);
  if (result.status !== "parsed")
    throw new Error(`${input} didn't parse: ${JSON.stringify(result)}`);
  return result.link;
}

function failed(input: string) {
  const result = parseLink(input);
  if (result.status !== "failed") throw new Error(`${input} parsed: ${JSON.stringify(result)}`);
  return result.failure;
}

/**
 * Real links, grouped by what they name: the creator's own (18 October 2026), the G1 samples' forms, and the
 * forms checked live on 24 October 2026. Every variant in a group gives `link`, apart from the fields in
 * `extra`, and the group's variants are the same link (FR-06.4).
 */
type Group = {
  name: string;
  link: ParsedLink;
  variants: (string | { input: string; extra: Partial<ParsedLink> })[];
};

const groups: Group[] = [
  {
    name: "a Spotify album",
    link: {
      service: "spotify",
      kind: "album",
      id: "1KVGLuPtrMrLlyy4Je6df7",
      albumId: "1KVGLuPtrMrLlyy4Je6df7",
      url: "https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
    },
    variants: [
      "https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7?si=LnOyGBweR4agFG4VItiz7A",
      "https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
      "https://open.spotify.com/intl-de/album/1KVGLuPtrMrLlyy4Je6df7?si=LnOyGBweR4agFG4VItiz7A",
      "https://open.spotify.com/intl-pt/album/1KVGLuPtrMrLlyy4Je6df7/",
      "spotify:album:1KVGLuPtrMrLlyy4Je6df7",
      "http://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7#tracks",
      "  https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7?si=x&nd=1&dlsi=y\n",
    ],
  },
  {
    name: "a Spotify track",
    link: {
      service: "spotify",
      kind: "track",
      id: "1tQy2AqgFc0AdddmIboIfX",
      url: "https://open.spotify.com/track/1tQy2AqgFc0AdddmIboIfX",
    },
    variants: [
      "https://open.spotify.com/track/1tQy2AqgFc0AdddmIboIfX",
      "https://open.spotify.com/intl-fi/track/1tQy2AqgFc0AdddmIboIfX?si=3a9c1f0e2b7d4c55",
      "spotify:track:1tQy2AqgFc0AdddmIboIfX",
    ],
  },
  {
    name: "an Apple Music album",
    link: {
      service: "apple-music",
      kind: "album",
      id: "268443092",
      albumId: "268443092",
      storefront: "us",
      url: "https://music.apple.com/us/album/268443092",
    },
    variants: [
      "https://music.apple.com/us/album/kind-of-blue/268443092",
      // Where `geo.music.apple.com` redirected on 24 October 2026.
      "https://music.apple.com/us/album/kind-of-blue/268443092?uo=4&app=music",
      "https://geo.music.apple.com/us/album/268443092",
      "https://music.apple.com/US/album/268443092",
      {
        input: "https://music.apple.com/fi/album/kind-of-blue/268443092?l=en-GB",
        extra: { storefront: "fi", url: "https://music.apple.com/fi/album/268443092" },
      },
      {
        input: "https://music.apple.com/album/268443092",
        extra: { storefront: undefined, url: "https://music.apple.com/album/268443092" },
      },
      {
        input: "https://music.apple.com/album/kind-of-blue/268443092",
        extra: { storefront: undefined, url: "https://music.apple.com/album/268443092" },
      },
    ],
  },
  {
    name: "an Apple Music album with a Cyrillic slug",
    link: {
      service: "apple-music",
      kind: "album",
      id: "869027888",
      albumId: "869027888",
      storefront: "fi",
      url: "https://music.apple.com/fi/album/869027888",
    },
    variants: [
      "https://music.apple.com/fi/album/%D0%B8%D0%BA%D1%80%D0%B0-deluxe/869027888",
      "https://music.apple.com/fi/album/икра-deluxe/869027888",
    ],
  },
  {
    name: "an Apple Music song",
    link: {
      service: "apple-music",
      kind: "track",
      id: "268443097",
      albumId: "268443092",
      storefront: "us",
      url: "https://music.apple.com/us/album/268443092?i=268443097",
    },
    variants: [
      "https://music.apple.com/us/album/kind-of-blue/268443092?i=268443097",
      "https://music.apple.com/us/album/268443092?i=268443097&l=en",
      {
        input: "https://music.apple.com/fi/song/so-what/268443097",
        extra: {
          albumId: undefined,
          storefront: "fi",
          url: "https://music.apple.com/fi/song/268443097",
        },
      },
      {
        input: "https://music.apple.com/song/268443097",
        extra: {
          albumId: undefined,
          storefront: undefined,
          url: "https://music.apple.com/song/268443097",
        },
      },
    ],
  },
  {
    name: "a Qobuz album with an alphanumeric id",
    link: {
      service: "qobuz",
      kind: "album",
      id: "mco0vy9isdq4a",
      albumId: "mco0vy9isdq4a",
      url: "https://open.qobuz.com/album/mco0vy9isdq4a",
    },
    variants: [
      {
        input: "https://www.qobuz.com/us-en/album/weezer-teal-album-weezer/mco0vy9isdq4a",
        extra: { locale: "us-en", slug: "weezer-teal-album-weezer" },
      },
      {
        input: "https://www.qobuz.com/album/weezer-teal-album-weezer/mco0vy9isdq4a",
        extra: { slug: "weezer-teal-album-weezer" },
      },
      {
        input: "https://qobuz.com/FR-FR/album/weezer-teal-album-weezer/MCO0VY9ISDQ4A",
        extra: { locale: "fr-fr", slug: "weezer-teal-album-weezer" },
      },
      "https://open.qobuz.com/album/mco0vy9isdq4a",
      "https://play.qobuz.com/album/mco0vy9isdq4a",
    ],
  },
  {
    name: "a Qobuz album whose title has no Latin letters",
    link: {
      service: "qobuz",
      kind: "album",
      id: "oulc1w5vun56a",
      albumId: "oulc1w5vun56a",
      url: "https://open.qobuz.com/album/oulc1w5vun56a",
    },
    variants: [
      {
        input: "https://www.qobuz.com/us-en/album/-/oulc1w5vun56a",
        extra: { locale: "us-en", slug: "-" },
      },
    ],
  },
  {
    name: "a Qobuz album with a numeric id",
    link: {
      service: "qobuz",
      kind: "album",
      id: "0884977423006",
      albumId: "0884977423006",
      url: "https://open.qobuz.com/album/0884977423006",
    },
    variants: [
      "https://open.qobuz.com/album/0884977423006",
      "https://play.qobuz.com/album/0884977423006?ssf=1",
    ],
  },
  {
    name: "a Qobuz track",
    link: {
      service: "qobuz",
      kind: "track",
      id: "59954874",
      url: "https://open.qobuz.com/track/59954874",
    },
    variants: ["https://open.qobuz.com/track/59954874", "https://play.qobuz.com/track/59954874"],
  },
  {
    name: "a Tidal album",
    link: {
      service: "tidal",
      kind: "album",
      id: "348182611",
      albumId: "348182611",
      url: "https://tidal.com/album/348182611",
    },
    variants: [
      "https://tidal.com/browse/album/348182611",
      "https://tidal.com/browse/album/348182611/u",
      "https://tidal.com/browse/album/348182611?u",
      "https://tidal.com/album/348182611/u",
      "https://tidal.com/album/348182611",
      "https://listen.tidal.com/album/348182611",
      "https://www.tidal.com/browse/album/348182611",
    ],
  },
  {
    name: "a Tidal track",
    link: {
      service: "tidal",
      kind: "track",
      id: "279764934",
      url: "https://tidal.com/track/279764934",
    },
    variants: [
      "https://tidal.com/browse/track/279764934?u",
      "https://tidal.com/track/279764934/u",
      "https://listen.tidal.com/track/279764934",
    ],
  },
  {
    name: "a YouTube Music album",
    link: {
      service: "youtube-music",
      kind: "album",
      id: "OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      albumId: "OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      url: "https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
    },
    variants: [
      "https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM&si=Ab1Cd2Ef3Gh4",
      "https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      "https://www.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      "https://youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM&feature=share",
      "https://m.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      "http://www.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM#top",
    ],
  },
  {
    name: "a YouTube Music track in an album",
    link: {
      service: "youtube-music",
      kind: "track",
      id: "lYBUbBu4W08",
      albumId: "OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      url: "https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
    },
    variants: [
      "https://music.youtube.com/watch?v=lYBUbBu4W08&list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      "https://music.youtube.com/watch?v=lYBUbBu4W08&list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM&si=x",
      "https://www.youtube.com/watch?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM&v=lYBUbBu4W08&index=2",
      "https://m.youtube.com/watch?v=lYBUbBu4W08&list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
    ],
  },
];

describe("parseLink: real link variants (FR-02.1, TS-40)", () => {
  for (const group of groups) {
    test(group.name, () => {
      for (const variant of group.variants) {
        const { input, extra } =
          typeof variant === "string" ? { input: variant, extra: {} } : variant;
        // toEqual treats an `undefined` in `extra` as the field being absent.
        expect(parsed(input)).toEqual({ ...group.link, ...extra });
      }
    });
  }
});

describe("equivalent variants (FR-06.4)", () => {
  test("each group's variants are the same link, and no other group's", () => {
    const links = groups.map((group) =>
      group.variants.map((variant) =>
        parsed(typeof variant === "string" ? variant : variant.input),
      ),
    );
    for (const [index, group] of links.entries()) {
      for (const link of group) {
        for (const [other, others] of links.entries()) {
          for (const otherLink of others) expect(sameLink(link, otherLink)).toBe(index === other);
        }
      }
    }
  });

  test("an Apple Music album and a song on it are different links", () => {
    const album = parsed("https://music.apple.com/us/album/kind-of-blue/268443092");
    const song = parsed("https://music.apple.com/us/album/kind-of-blue/268443092?i=268443097");
    expect(song.albumId).toBe(album.id);
    expect(sameLink(album, song)).toBe(false);
  });
});

describe("parseLink: the G1 samples", () => {
  const fixtures = path.join(import.meta.dir, "../../../tooling/fixtures");
  const samples = [
    "g1-sample",
    "g1-spotify",
    "g1-apple",
    "g1-qobuz",
    "g1-tidal",
    "g1-youtube-music",
  ];

  test("every link parses, as the service its host names", async () => {
    const hostServices: Record<string, StreamingService> = {
      "open.spotify.com": "spotify",
      "music.apple.com": "apple-music",
      "www.qobuz.com": "qobuz",
      "open.qobuz.com": "qobuz",
      "play.qobuz.com": "qobuz",
      "tidal.com": "tidal",
      "music.youtube.com": "youtube-music",
    };
    const links = (
      await Promise.all(
        samples.map((sample) => Bun.file(path.join(fixtures, sample, "links.txt")).text()),
      )
    )
      .flatMap((text) => text.split("\n"))
      .map((line) => line.replace(/\s#.*$/, "").trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(links.length).toBeGreaterThan(400);
    for (const input of links) {
      expect(parsed(input).service).toBe(hostServices[new URL(input).hostname]!);
    }
  });
});

describe("parseLink: unsupported input (FR-02.3)", () => {
  const notALink =
    "This doesn't look like a Spotify, Apple Music, Qobuz, Tidal or YouTube Music album or track link.";

  test("other sites, plain text and other schemes", () => {
    for (const input of [
      "https://soundcloud.com/x",
      "https://youtu.be/dQw4w9WgXcQ",
      "Kind of Blue",
      "",
      "   ",
      "open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
      "ftp://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://itunes.apple.com/us/album/kind-of-blue/id268443092",
      "https://deezer.com/album/302127",
    ]) {
      const result = failed(input);
      expect(result.code).toBe("unsupported_link");
      expect(result.problem).toMatchObject({ status: 422, detail: notALink });
    }
  });

  test("a service's links that aren't albums or tracks", () => {
    for (const [input, service] of [
      ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "Spotify"],
      ["https://open.spotify.com/artist/0kbYTNQb4Pb1rPbbaF0pT4", "Spotify"],
      ["https://open.spotify.com/", "Spotify"],
      ["spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", "Spotify"],
      ["spotify:user:spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", "Spotify"],
      [
        "https://music.apple.com/us/playlist/jazz-essentials/pl.2b0e6e332fdf4b7a91164da3162127b5",
        "Apple Music",
      ],
      ["https://music.apple.com/us/artist/miles-davis/44984", "Apple Music"],
      ["https://www.qobuz.com/gb-en/interpreter/miles-davis/41361", "Qobuz"],
      ["https://open.qobuz.com/playlist/1234", "Qobuz"],
      ["https://tidal.com/browse/playlist/abc", "Tidal"],
      ["https://tidal.com/browse/artist/1566", "Tidal"],
    ] as const) {
      expect(failed(input).problem.detail).toBe(
        `Only ${service} album and track links can be added.`,
      );
    }
  });

  test("YouTube links that name no album point to YouTube Music's Share menu", () => {
    const noAlbum =
      "This YouTube link doesn't name an album. In YouTube Music, open the album and copy its link from Share.";
    const notAnAlbum =
      "This YouTube playlist isn't an album. In YouTube Music, open the album and copy its link from Share.";
    for (const [input, detail] of [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", noAlbum],
      ["https://music.youtube.com/browse/MPREb_abc123", noAlbum],
      ["https://music.youtube.com/channel/UC123", noAlbum],
      ["https://www.youtube.com/watch?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM", noAlbum],
      ["https://music.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", notAnAlbum],
      ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ", notAnAlbum],
    ] as const) {
      expect(failed(input).problem.detail).toBe(detail);
    }
  });

  test("album and track links that look incomplete", () => {
    for (const [input, service] of [
      ["https://open.spotify.com/album/1KVGLuPtrM", "Spotify"],
      ["https://open.spotify.com/album/", "Spotify"],
      ["spotify:album:1KVGLuPtrM", "Spotify"],
      ["https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7/extra", "Spotify"],
      ["https://music.apple.com/us/album/kind-of-blue", "Apple Music"],
      ["https://music.apple.com/us/album/kind-of-blue/268443092?i=so-what", "Apple Music"],
      ["https://music.apple.com/us/album/a/b/268443092", "Apple Music"],
      ["https://www.qobuz.com/gb-en/album/kind-of-blue", "Qobuz"],
      ["https://open.qobuz.com/album/", "Qobuz"],
      ["https://open.qobuz.com/album/abc_def", "Qobuz"],
      ["https://tidal.com/browse/album/", "Tidal"],
      ["https://tidal.com/browse/album/abc", "Tidal"],
      ["https://music.youtube.com/playlist?list=OLAK5uy_short", "YouTube Music"],
      [
        "https://music.youtube.com/watch?v=short&list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
        "YouTube Music",
      ],
    ] as const) {
      expect(failed(input).problem.detail).toBe(
        `This ${service} link looks incomplete. Copy it again from ${service}.`,
      );
    }
  });
});

describe("parseLink: hostile input (Q-05)", () => {
  test("credentials, ports, look-alike hosts and over-long input are unsupported", () => {
    for (const input of [
      "https://user:secret@open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
      "https://user@tidal.com/album/348182611",
      "https://open.spotify.com:8443/album/1KVGLuPtrMrLlyy4Je6df7",
      "https://open.spotify.com.example.net/album/1KVGLuPtrMrLlyy4Je6df7",
      "https://evilspotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
      "https://open.spotify.com./album/1KVGLuPtrMrLlyy4Je6df7",
      "https://constructor/album/1KVGLuPtrMrLlyy4Je6df7",
      "https://127.0.0.1/album/1KVGLuPtrMrLlyy4Je6df7",
      `https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7?si=${"x".repeat(2_048)}`,
    ]) {
      expect(failed(input).code).toBe("unsupported_link");
    }
  });

  test("the default port is the service's", () => {
    expect(parsed("https://open.spotify.com:443/album/1KVGLuPtrMrLlyy4Je6df7").id).toBe(
      "1KVGLuPtrMrLlyy4Je6df7",
    );
  });
});

const redirect = (location: string, status = 307) =>
  new Response(null, { status, headers: { location } });

/** A fetcher that answers each request with the next of `answers`, and records what was requested. */
function scripted(answers: (Response | Error)[]): Fetcher & { requested: string[] } {
  const requested: string[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe("manual");
    requested.push(url);
    const answer = answers.shift();
    if (!answer) throw new Error(`no answer scripted for ${url}`);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return Object.assign(fetcher, { requested });
}

describe("short links (TS-40)", () => {
  test("parseLink leaves them for the resolver, as https, with their service", () => {
    expect(parseLink("https://spotify.link/abc123XYZ")).toEqual({
      status: "short",
      service: "spotify",
      url: "https://spotify.link/abc123XYZ",
    });
    expect(parseLink("http://spotify.app.link/abc123XYZ?_p=x#y")).toEqual({
      status: "short",
      service: "spotify",
      url: "https://spotify.app.link/abc123XYZ?_p=x",
    });
  });

  test("follow allowlisted redirects to the Spotify album", async () => {
    const fetcher = scripted([
      redirect("https://spotify.app.link/abc123XYZ?_p=c"),
      redirect("https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7?si=x&_branch_match_id=1"),
    ]);
    const result = await resolveShortLink("https://spotify.link/abc123XYZ", fetcher);
    expect(result).toEqual({
      status: "parsed",
      link: {
        service: "spotify",
        kind: "album",
        id: "1KVGLuPtrMrLlyy4Je6df7",
        albumId: "1KVGLuPtrMrLlyy4Je6df7",
        url: "https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
      },
    });
    expect(fetcher.requested).toEqual([
      "https://spotify.link/abc123XYZ",
      "https://spotify.app.link/abc123XYZ?_p=c",
    ]);
  });

  test("a relative Location resolves against the hop", async () => {
    const fetcher = scripted([
      redirect("/abc123XYZ?step=2", 302),
      redirect("https://open.spotify.com/track/1tQy2AqgFc0AdddmIboIfX"),
    ]);
    const result = await resolveShortLink("https://spotify.link/abc123XYZ", fetcher);
    expect(result).toMatchObject({ status: "parsed", link: { kind: "track" } });
    expect(fetcher.requested[1]).toBe("https://spotify.link/abc123XYZ?step=2");
  });

  const deadEnd = {
    status: "failed",
    failure: {
      code: "unsupported_link",
      problem: { detail: "This Spotify short link doesn't lead to an album or track." },
    },
  };

  test("a redirect off the allowlist is never requested", async () => {
    const locations = [
      "https://example.com/album",
      "http://169.254.169.254/latest/meta-data/",
      "https://tidal.com/album/348182611",
      "http://spotify.app.link/abc123XYZ",
      "https://spotify.app.link:8443/abc123XYZ",
    ];
    await Promise.all(
      locations.map(async (location) => {
        const fetcher = scripted([redirect(location), redirect("https://open.spotify.com/")]);
        expect(await resolveShortLink("https://spotify.link/abc123XYZ", fetcher)).toMatchObject(
          deadEnd,
        );
        expect(fetcher.requested).toEqual(["https://spotify.link/abc123XYZ"]);
      }),
    );
  });

  test("Spotify's home page, a playlist, an answer without a redirect, or a fourth hop lead nowhere", async () => {
    const scripts = [
      // Where an unknown code redirected on 24 October 2026.
      [redirect("https://open.spotify.com/")],
      [redirect("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")],
      [new Response("<html></html>", { status: 200 })],
      [new Response(null, { status: 404 })],
      [new Response(null, { status: 307 })],
      [
        redirect("https://spotify.app.link/a"),
        redirect("https://spotify.link/b"),
        redirect("https://spotify.app.link/c"),
        redirect("https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7"),
      ],
    ];
    await Promise.all(
      scripts.map(async (answers) => {
        const fetcher = scripted(answers);
        expect(await resolveShortLink("https://spotify.link/abc123XYZ", fetcher)).toMatchObject(
          deadEnd,
        );
        expect(fetcher.requested.length).toBeLessThanOrEqual(3);
      }),
    );
  });

  test("a failed request, a server error or a rate limit can be retried", async () => {
    const answers = [
      new TypeError("fetch failed"),
      new Response(null, { status: 503 }),
      new Response(null, { status: 429 }),
    ];
    await Promise.all(
      answers.map(async (answer) => {
        expect(
          await resolveShortLink("https://spotify.link/abc123XYZ", scripted([answer])),
        ).toMatchObject({
          status: "failed",
          failure: {
            code: "provider_unavailable",
            problem: {
              status: 503,
              detail: "Couldn't reach Spotify to open this short link. Try again.",
            },
          },
        });
      }),
    );
  });

  test("a URL that isn't a short link is never requested", async () => {
    const fetcher = scripted([]);
    for (const url of ["https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7", "not a url"]) {
      // oxlint-disable-next-line no-await-in-loop
      expect(await resolveShortLink(url, fetcher)).toMatchObject({
        status: "failed",
        failure: { code: "unsupported_link" },
      });
    }
    expect(fetcher.requested).toEqual([]);
  });
});

describe("isLinkHost", () => {
  test("the services' hosts and their short links' hosts, in any case", () => {
    for (const host of [
      "open.spotify.com",
      "spotify.link",
      "spotify.app.link",
      "music.apple.com",
      "geo.music.apple.com",
      "qobuz.com",
      "play.qobuz.com",
      "listen.tidal.com",
      "m.youtube.com",
      "Music.YouTube.com",
    ]) {
      expect(isLinkHost(host)).toBe(true);
    }
    for (const host of [
      "example.com",
      "spotify.com",
      "open.spotify.com.example.net",
      "constructor",
    ]) {
      expect(isLinkHost(host)).toBe(false);
    }
  });
});
