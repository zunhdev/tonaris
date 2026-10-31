// The YouTube Data API client (TON-131) on stand-in answers: what it reads from each answer, that the key travels
// only in a header, and how refusals and outages end. The chain's use of it is replayed in identify.test.ts.

import { describe, expect, test } from "bun:test";

import { ProviderUnavailableError } from "./provider-cache";
import type { SafeFetchInit } from "./safe-fetch";
import { albumTitle, descriptionDate, topicArtist, YouTubeData } from "./youtube";

const list = "OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM";

const answers = {
  playlists: {
    items: [{ snippet: { title: "Album - Bright Future" }, contentDetails: { itemCount: 12 } }],
  },
  playlistItems: {
    items: [
      { snippet: { videoOwnerChannelTitle: "4AD" }, contentDetails: { videoId: "00000000000" } },
      {
        snippet: { videoOwnerChannelTitle: "Adrianne Lenker - Topic" },
        contentDetails: { videoId: "00000000001" },
      },
    ],
  },
  videos: {
    items: [
      {
        snippet: {
          description:
            "Provided to YouTube by 4AD\n\nReal House · Adrianne Lenker\n\nBright Future\n\n℗ 2024 4AD Ltd\n\nReleased on: 2024-03-22\n",
        },
      },
    ],
  },
};

type Read = keyof typeof answers;

const isRead = (name: string | undefined): name is Read =>
  name === "playlists" || name === "playlistItems" || name === "videos";

/** A client whose reads get `answer(read)`, recording what each read sent. */
function client(answer: (read: Read) => Response = (read) => Response.json(answers[read])) {
  const sent: { url: string; init: SafeFetchInit }[] = [];
  const refused: unknown[] = [];
  let clock = 0;
  const youtube = new YouTubeData({
    apiKey: "the-key",
    fetch: async (url, init) => {
      sent.push({ url, init });
      const read = new URL(url).pathname.split("/").at(-1);
      if (!isRead(read)) throw new Error(`Not a read: ${url}`);
      return answer(read);
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    onRefused: (...args) => refused.push(args),
  });
  return { youtube, sent, refused };
}

describe("what the answers give", () => {
  test("the title without 'Album - ', the Topic channel's artist, and the date", () => {
    expect(albumTitle("Album - Bright Future")).toBe("Bright Future");
    expect(albumTitle("EP - Doing")).toBe("Doing");
    expect(albumTitle("Kind of Blue")).toBe("Kind of Blue");
    expect(topicArtist("Adrianne Lenker - Topic")).toBe("Adrianne Lenker");
    expect(topicArtist("AdrianneLenkerVEVO")).toBeUndefined();
    expect(descriptionDate(answers.videos.items[0]!.snippet.description)).toBe("2024-03-22");
    expect(descriptionDate("Provided to YouTube by X\n\n℗ 1997 X Records")).toBe("1997");
    expect(descriptionDate("Released on: 2024-03-22")).toBeUndefined();
  });

  test("three reads give the hints and the playlist's track count", async () => {
    const { youtube, sent } = client();
    expect(await youtube.albumHints(list)).toEqual({
      title: "Bright Future",
      artist: "Adrianne Lenker",
      date: "2024-03-22",
      tracks: 12,
    });
    expect(sent.map(({ url }) => url)).toEqual([
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${list}`,
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${list}`,
      "https://www.googleapis.com/youtube/v3/videos?part=snippet&id=00000000001",
    ]);
  });

  test("the key travels in a header, never in a URL", async () => {
    const { youtube, sent } = client();
    await youtube.albumHints(list);
    for (const { url, init } of sent) {
      expect(url).not.toContain("the-key");
      expect(init.headers).toEqual({ "x-goog-api-key": "the-key" });
    }
  });

  test("no playlist, no Topic track or no date gives no hints", async () => {
    const empty = client((read) =>
      read === "playlists" ? Response.json({ items: [] }) : Response.json(answers[read]),
    );
    expect(await empty.youtube.albumHints(list)).toBeUndefined();
    expect(empty.sent).toHaveLength(1);
    const videosOnly = client((read) =>
      read === "playlistItems"
        ? Response.json({ items: [answers.playlistItems.items[0]] })
        : Response.json(answers[read]),
    );
    expect(await videosOnly.youtube.albumHints(list)).toBeUndefined();
    const undated = client((read) =>
      read === "videos"
        ? Response.json({ items: [{ snippet: { description: "Official video" } }] })
        : Response.json(answers[read]),
    );
    expect(await undated.youtube.albumHints(list)).toBeUndefined();
  });
});

describe("refusals and outages", () => {
  test("a 403 or 400 gives no hints, and says why without the key", async () => {
    const { youtube, refused } = client(() =>
      Response.json(
        { error: { code: 403, errors: [{ reason: "quotaExceeded" }] } },
        { status: 403 },
      ),
    );
    expect(await youtube.albumHints(list)).toBeUndefined();
    expect(refused).toEqual([["playlists", 403, "quotaExceeded"]]);
    const bad = client(() => Response.json({ error: { errors: [] } }, { status: 400 }));
    expect(await bad.youtube.albumHints(list)).toBeUndefined();
    expect(bad.refused).toEqual([["playlists", 400, undefined]]);
  });

  test("a 404 gives no hints", async () => {
    const { youtube, refused } = client(() => new Response(null, { status: 404 }));
    expect(await youtube.albumHints(list)).toBeUndefined();
    expect(refused).toEqual([]);
  });

  test("429, 5xx and no answer are YouTube being unavailable", async () => {
    for (const answer of [
      () => new Response(null, { status: 429 }),
      () => new Response(null, { status: 503 }),
      () => {
        throw new Error("network down");
      },
    ]) {
      const { youtube } = client(answer);
      // oxlint-disable-next-line no-await-in-loop
      const error = await youtube.albumHints(list).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect(error).toMatchObject({ provider: "youtube" });
      expect(error instanceof Error && error.message).not.toContain("the-key");
    }
  });
});
