// The TON-99 store-page client against a fake www.qobuz.com: robots.txt, the facts read from a page, the requests
// each kind of link takes, and the Qobuz rules. The pages here are made up, not Qobuz's HTML.

import { describe, expect, test } from "bun:test";

import type { Candidate } from "../g1-apple-hints/rules";
import { parseLink } from "../g1-musicbrainz/links";
import { decodeEntities, extractHints, Qobuz, robotsAllows } from "./qobuz";
import { decideQobuz, eligible, rules } from "./rules";

const robots = `User-agent: ClaudeBot
User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /order/
Disallow: /*/search/albums/
Disallow: */undefined$
Allow: /order/receipt
`;

describe("robotsAllows", () => {
  test("follows the * group for an agent no group names", () => {
    expect(robotsAllows(robots, "Tonaris", "/us-en/album/-/0")).toBe(true);
    expect(robotsAllows(robots, "Tonaris", "/order/123")).toBe(false);
    expect(robotsAllows(robots, "Tonaris", "/fr-fr/search/albums/x")).toBe(false);
    expect(robotsAllows(robots, "Tonaris", "/a/undefined")).toBe(false);
    expect(robotsAllows(robots, "Tonaris", "/a/undefined/b")).toBe(true);
  });

  test("lets the longest rule win, and Allow a tie", () => {
    expect(robotsAllows(robots, "Tonaris", "/order/receipt")).toBe(true);
  });

  test("follows a group that names the agent", () => {
    expect(robotsAllows(robots, "ClaudeBot", "/us-en/album/-/0")).toBe(false);
    expect(
      robotsAllows(
        `${robots}\nUser-agent: Tonaris\nDisallow: /us-en/album/\n`,
        "Tonaris",
        "/us-en/album/-/0",
      ),
    ).toBe(false);
  });
});

const page = (values: {
  name?: string;
  artist?: string;
  date?: string;
  og?: string;
}) => `<html><head>
<meta property="og:title" content="${values.og ?? "Night Songs (Remastered), The Testers &amp; Friends - Qobuz"}" />
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Night Songs",
"brand":{"@type":"Brand","name":"${values.artist ?? "The Testers &amp; Friends"}"},"releaseDate":"1999-03-01"}</script>
<script type="application/ld+json">{"@type":"MusicAlbum","name":"${values.name ?? "Night Songs"}",
"datePublished":"${values.date ?? "1999-03-01"}"}</script>
<script type="application/ld+json">not json</script>
</head></html>`;

describe("extractHints", () => {
  test("reads the album name, the brand as artist, the date, and og:title's version note", () => {
    expect(extractHints(page({}))).toEqual({
      title: "Night Songs",
      fullTitle: "Night Songs (Remastered)",
      artist: "The Testers & Friends",
      date: "1999-03-01",
    });
  });

  test("falls back to the name when og:title doesn't end with the artist", () => {
    expect(extractHints(page({ og: "Something else - Qobuz" }))?.fullTitle).toBe("Night Songs");
  });

  test("gives nothing without a usable date or artist", () => {
    expect(extractHints(page({ date: "1999" }))).toBeUndefined();
    expect(extractHints(page({ artist: "" }))).toBeUndefined();
    expect(extractHints("<html></html>")).toBeUndefined();
  });

  test("decodes entities", () => {
    expect(decodeEntities("Guns N&#039; Roses &amp; &#x4E01; &quot;x&quot; &nbsp;")).toBe(
      'Guns N\' Roses & 丁 "x" &nbsp;',
    );
  });
});

/** A fake www.qobuz.com: paths to answers, recording what was asked. */
function store(answers: Record<string, { status: number; location?: string; body?: string }>) {
  const asked: { url: string; userAgent: string | null; redirect?: RequestInit["redirect"] }[] = [];
  const qobuz = new Qobuz({
    minIntervalMs: 0,
    fetch: async (url, init) => {
      asked.push({
        url,
        userAgent: new Headers(init.headers).get("user-agent"),
        redirect: init.redirect,
      });
      const answer = answers[new URL(url).pathname] ?? { status: 404 };
      return new Response(answer.body ?? "", {
        status: answer.status,
        headers: answer.location ? { location: answer.location } : {},
      });
    },
  });
  return { qobuz, asked };
}

const linkOf = (input: string) => {
  const parsed = parseLink(input);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.link;
};

describe("Qobuz.album", () => {
  test("an open link: request A's redirect names the slug, request B reads the page", async () => {
    const { qobuz, asked } = store({
      "/us-en/album/-/abc123": { status: 301, location: "/us-en/album/night-songs/abc123" },
      "/us-en/album/night-songs/abc123": { status: 200, body: page({}) },
    });
    const result = await qobuz.album(linkOf("https://open.qobuz.com/album/abc123"));
    expect(result).toMatchObject({
      slug: "night-songs",
      requests: 2,
      hints: { title: "Night Songs" },
    });
    expect(asked.map((a) => a.url)).toEqual([
      "https://www.qobuz.com/us-en/album/-/abc123",
      "https://www.qobuz.com/us-en/album/night-songs/abc123",
    ]);
    expect(asked.every((a) => a.redirect === "manual" && a.userAgent?.startsWith("Tonaris/"))).toBe(
      true,
    );
    expect(qobuz.requests.map((r) => [r.kind, r.status])).toEqual([
      ["slug", 301],
      ["page", 200],
    ]);
  });

  test("a title without Latin letters: request A's answer is the page", async () => {
    const { qobuz } = store({ "/us-en/album/-/abc123": { status: 200, body: page({}) } });
    const result = await qobuz.album(linkOf("https://play.qobuz.com/album/abc123"));
    expect(result).toMatchObject({
      slug: "-",
      requests: 1,
      hints: { artist: "The Testers & Friends" },
    });
  });

  test("a store link goes straight to its page, in its locale", async () => {
    const { qobuz, asked } = store({
      "/fr-fr/album/night-songs/abc123": { status: 200, body: page({}) },
    });
    const result = await qobuz.album(
      linkOf("https://www.qobuz.com/fr-fr/album/night-songs/abc123"),
    );
    expect(result).toMatchObject({ requests: 1, hints: { date: "1999-03-01" } });
    expect(asked).toHaveLength(1);
  });

  test("never follows a redirect to another album or host", async () => {
    const { qobuz, asked } = store({
      "/us-en/album/-/abc123": {
        status: 301,
        location: "https://example.com/us-en/album/x/abc123",
      },
      "/us-en/album/-/def456": { status: 302, location: "/us-en/album/x/zzz999" },
    });
    expect(await qobuz.album(linkOf("https://open.qobuz.com/album/abc123"))).toMatchObject({
      requests: 1,
      problem: "a redirect away from the album (301)",
    });
    expect(await qobuz.album(linkOf("https://open.qobuz.com/album/def456"))).toMatchObject({
      problem: "a redirect away from the album (302)",
    });
    expect(asked).toHaveLength(2);
  });

  test("reports a missing page", async () => {
    const { qobuz } = store({});
    expect(await qobuz.album(linkOf("https://open.qobuz.com/album/abc123"))).toEqual({
      requests: 1,
      problem: "the page answered 404",
    });
  });

  test("gives up on a request that takes too long", async () => {
    const qobuz = new Qobuz({
      minIntervalMs: 0,
      timeoutMs: 10,
      fetch: async (_, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    });
    const error = await qobuz
      .album(linkOf("https://open.qobuz.com/album/abc123"))
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ message: "www.qobuz.com didn't answer within 0.01 s" });
    expect(qobuz.requests).toMatchObject([{ kind: "slug", status: 0 }]);
  });

  test("checks robots.txt for album pages", async () => {
    expect(
      await store({ "/robots.txt": { status: 200, body: robots } }).qobuz.albumPagesAllowed(),
    ).toBe(true);
    expect(
      await store({
        "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /*/album/\n" },
      }).qobuz.albumPagesAllowed(),
    ).toBe(false);
  });
});

const release = (values: Partial<Candidate>): Candidate => ({
  id: "r",
  title: "Night Songs",
  artistCredit: "The Testers & Friends",
  date: "2009-11-02",
  trackCount: 12,
  releaseGroupId: "rg-night",
  releaseGroupTitle: "Night Songs",
  artistNames: ["The Testers & Friends"],
  firstReleaseDate: "1999-03-01",
  status: "Official",
  primaryType: "Album",
  ...values,
});

const rule = (name: string) => {
  const found = rules.find((r) => r.name === name);
  if (!found) throw new Error(`no rule ${name}`);
  return found;
};
const hints = {
  title: "Night Songs",
  fullTitle: "Night Songs (Live)",
  artist: "The Testers & Friends",
  date: "1999-01-01",
};

describe("Qobuz rules", () => {
  test("no rule counts tracks, which pages don't show", () => {
    expect(rules.every((r) => r.tracks === "any")).toBe(true);
  });

  test("the official rules drop bootlegs and singles", () => {
    const official = rule("…official albums and EPs only (G2's proposal)");
    const candidates = [
      release({}),
      release({ id: "boot", releaseGroupId: "rg-boot", status: "Bootleg" }),
      release({ id: "single", releaseGroupId: "rg-single", primaryType: "Single" }),
      release({ id: "ep", releaseGroupId: "rg-ep", primaryType: "EP" }),
    ];
    expect(eligible(official, candidates).map((c) => c.id)).toEqual(["r", "ep"]);
    expect(
      decideQobuz(rule("…loose titles and artist names (TON-16's rule)"), hints, candidates),
    ).toMatchObject({
      outcome: "ambiguous",
      albums: 4,
    });
    expect(decideQobuz(official, hints, candidates.slice(0, 3))).toMatchObject({
      outcome: "accepted",
      releaseGroupId: "rg-night",
    });
  });

  test("the version rule compares og:title's title", () => {
    const withVersion = rule("…with Qobuz's version note in the title");
    expect(decideQobuz(withVersion, hints, [release({})]).outcome).toBe("none");
    expect(
      decideQobuz(withVersion, hints, [release({ title: "Night Songs (Live)" })]).outcome,
    ).toBe("accepted");
  });

  test("a year-only date still matches the original year", () => {
    const original = rule("…release or original year");
    expect(decideQobuz(original, hints, [release({})]).outcome).toBe("accepted");
    expect(
      decideQobuz(rule("Clean titles, artist credit, release year, one album"), hints, [
        release({}),
      ]).outcome,
    ).toBe("none");
  });
});
