import { describe, expect, test } from "bun:test";

import type { SaveState } from "@/client/sync/save-states";

import { failure, uuidv7, type Outcome } from "@tonaris/domain";

import { captureDraft } from "./manual-entry";

const capture = (link: string, outcome: Outcome, listId: string | null = null): SaveState => ({
  mutation: {
    mutationId: uuidv7(),
    name: "album.capture",
    args: { albumId: uuidv7(), link, listId },
  },
  key: "",
  status: outcome.status,
  outcome,
  since: 0,
});

describe("manual entry from a capture (DS-47, DS-48)", () => {
  test("asked for details: prefilled with capture's values, continuing the capture", () => {
    const list = uuidv7();
    const reason =
      "Tonaris couldn't find this album in MusicBrainz. Enter its details; the link is kept.";
    const state = capture(
      "https://music.apple.com/us/album/1000000001",
      {
        status: "needs_input",
        need: "details",
        candidates: [
          {
            service: "apple-music",
            url: "https://music.apple.com/us/album/1000000001",
            reason,
            prefill: {
              source: "itunes-lookup",
              values: { title: "Idéal", artistCredit: "Trust", originalYear: 1983 },
            },
          },
        ],
      },
      list,
    );
    const draft = captureDraft(state);
    expect(draft?.form).toMatchObject({
      title: "Idéal",
      artistCredit: "Trust",
      originalYear: "1983",
      listId: list,
      links: { "apple-music": "" },
    });
    expect(draft?.capture).toEqual({
      mode: "details",
      mutationId: state.mutation.mutationId,
      link: "https://music.apple.com/us/album/1000000001",
      reason,
    });
    expect(draft?.replaces).toBeUndefined();
  });

  test("none of the candidates: an empty form, continuing the capture", () => {
    const draft = captureDraft(
      capture("https://music.apple.com/us/album/1000000002", {
        status: "needs_input",
        need: "match",
        candidates: [{ releaseGroupId: uuidv7(), title: "Holy Diver", albumId: null }],
      }),
    );
    expect(draft?.form.title).toBe("");
    expect(draft?.capture?.mode).toBe("details");
  });

  test("after a failure: the link in its service's field, replacing the capture", () => {
    const link = "https://open.spotify.com/album/0000000000000000000009?si=x";
    const unavailable = failure(
      "provider_unavailable",
      "Couldn't reach MusicBrainz. Try again, or enter the details manually.",
    );
    const state = capture(link, unavailable);
    const draft = captureDraft(state);
    expect(draft?.form.links.spotify).toBe(link);
    expect(draft?.replaces).toEqual([state.mutation.mutationId]);
    expect(draft?.capture).toMatchObject({
      mode: "failed",
      reason: "Couldn't reach MusicBrainz. Try again, or enter the details manually.",
    });

    // Text of no service keeps no link.
    expect(
      captureDraft(capture("not a link", failure("unsupported_link", "No.")))?.form.links,
    ).toEqual({
      spotify: "",
      "apple-music": "",
      qobuz: "",
      tidal: "",
      "youtube-music": "",
    });
  });
});
