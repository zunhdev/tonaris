// The export's Markdown and README (FR-08.2, TS-82): the tree as headings, lists as tables in the owner's arrangement,
// Unsorted and Trash with their dates, values and links in cells, Markdown's marks escaped; and a README that names
// every part of the JSON.

import { describe, expect, test } from "bun:test";

import type { Album } from "./albums";
import { buildExport, exportJsonSchema, type ExportSource } from "./export";
import { renderCollection } from "./export-markdown";
import { exportReadme } from "./export-readme";
import { uuidv7 } from "./ids";
import { appViewDefaults } from "./views";

const album = (title: string, extra: Partial<Album> = {}): ExportSource["albums"][number] => ({
  id: uuidv7(),
  title,
  artistCredit: "Miles Davis",
  releaseType: "album",
  isLive: false,
  originalYear: 1959,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  mbReleaseId: null,
  mbReleaseGroupId: null,
  trashedAt: null,
  trashUnitId: null,
  ...extra,
});

const container = (kind: "folder" | "list", name: string, parentId: string | null = null) => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
  trashedAt: null,
  trashUnitId: null,
});

const empty = (): ExportSource => ({
  exportedAt: new Date("2026-10-29T12:00:00Z"),
  albums: [],
  containers: [],
  memberships: [],
  links: [],
  fields: [],
  values: [],
  provenance: [],
  views: [],
  positions: [],
  defaults: appViewDefaults,
  units: [],
});

const render = (source: ExportSource) => renderCollection(buildExport(source, () => true));

describe("renderCollection", () => {
  test("folders become headings and lists tables, in the owner's order, then Unsorted and Trash", () => {
    const jazz = container("folder", "Jazz");
    const modal = container("list", "Modal", jazz.id);
    const kind = album("Kind of Blue");
    const milestones = album("Milestones", { originalYear: 1958 });
    const loose = album("Loose one");
    const unitId = uuidv7();
    const old = {
      ...container("list", "Old list"),
      trashedAt: new Date("2026-10-20T00:00:00Z"),
      trashUnitId: unitId,
    };
    const source = {
      ...empty(),
      albums: [kind, milestones, loose],
      containers: [jazz, modal, old],
      memberships: [
        { listId: modal.id, albumId: kind.id },
        { listId: modal.id, albumId: milestones.id },
        { listId: old.id, albumId: kind.id },
      ],
      // Manual order puts Kind of Blue after Milestones, against the year sort's default.
      views: [
        {
          viewKey: modal.id,
          sortMode: "manual" as const,
          sortDir: null,
          grouped: false,
          layout: null,
        },
      ],
      positions: [
        { viewKey: modal.id, itemId: milestones.id, key: "a0" },
        { viewKey: modal.id, itemId: kind.id, key: "a1" },
      ],
      units: [
        {
          id: unitId,
          kind: "list" as const,
          rootId: old.id,
          deletedAt: new Date("2026-10-20T00:00:00Z"),
          expiresAt: new Date("2026-11-19T00:00:00Z"),
        },
      ],
    };
    const text = render(source);
    expect(text).toStartWith(
      "# Your Tonaris collection\n\nExported on 2026-10-29 at 12:00 UTC: 3 albums, and 0 in Trash.",
    );
    const headings = text.split("\n").filter((line) => line.startsWith("#"));
    expect(headings).toEqual([
      "# Your Tonaris collection",
      "## Jazz",
      "### Modal",
      "## Unsorted",
      "## Trash",
      "### Old list (list)",
    ]);
    const modalTable = text.slice(text.indexOf("### Modal"), text.indexOf("## Unsorted"));
    expect(modalTable.indexOf("Milestones")).toBeLessThan(modalTable.indexOf("Kind of Blue"));
    expect(text).toContain("| 1 | Loose one | Miles Davis | 1959 | Album |  |");
    expect(text).toContain("Deleted on 2026-10-20; deleted for good on 2026-11-19.");
    expect(text.slice(text.indexOf("### Old list"))).toContain("| 1 | Kind of Blue |");
  });

  test("past Markdown's six heading levels, a heading names its ancestors from there down", () => {
    const folders: ReturnType<typeof container>[] = [];
    for (const name of ["F1", "F2", "F3", "F4", "F5", "F6"])
      folders.push(container("folder", name, folders.at(-1)?.id ?? null));
    const deep = container("list", "Deep", folders.at(-1)?.id ?? null);
    const headings = render({ ...empty(), containers: [...folders, deep] })
      .split("\n")
      .filter((line) => line.startsWith("#"));
    expect(headings.slice(1, 8)).toEqual([
      "## F1",
      "### F2",
      "#### F3",
      "##### F4",
      "###### F5",
      "###### F5 › F6",
      "###### F5 › F6 › Deep",
    ]);
  });

  test("cells show values, links and live years, with Markdown's marks escaped", () => {
    const live = album("Live | at the *Plugged Nickel*", {
      isLive: true,
      recordingYearStart: 1965,
      recordingYearEnd: 1966,
    });
    const rating = {
      id: uuidv7(),
      name: "Rating",
      type: "single_choice" as const,
      options: [{ id: uuidv7(), label: "★★★★★" }],
    };
    const notes = { id: uuidv7(), name: "Notes", type: "text" as const, options: [] };
    const unused = { id: uuidv7(), name: "Never used", type: "yes_no" as const, options: [] };
    const source = {
      ...empty(),
      albums: [live],
      fields: [rating, notes, unused],
      values: [
        { albumId: live.id, fieldId: rating.id, value: rating.options[0]!.id },
        { albumId: live.id, fieldId: notes.id, value: null },
      ],
      links: [
        { albumId: live.id, service: "spotify" as const, url: "https://open.spotify.com/album/1" },
        { albumId: live.id, service: "qobuz" as const, url: "https://www.qobuz.com/album/2" },
      ],
    };
    const text = render(source);
    expect(text).toContain("| # | Title | Artist | Year | Type | Links | Rating | Notes |");
    expect(text).toContain(
      "| 1 | Live \\| at the \\*Plugged Nickel\\* | Miles Davis | rec. 1965–1966 | Live | [Spotify](https://open.spotify.com/album/1) · [Qobuz](https://www.qobuz.com/album/2) | ★★★★★ | — |",
    );
    expect(text).not.toContain("Never used");
  });

  test("a grouped view shows its albums by release type", () => {
    const studio = album("Kind of Blue");
    const ep = album("Four", { releaseType: "ep" });
    const source = { ...empty(), albums: [studio, ep] };
    const text = render({ ...source, defaults: { ...appViewDefaults, grouped: true } });
    const unsorted = text.slice(text.indexOf("## Unsorted"), text.indexOf("## Trash"));
    expect(unsorted.indexOf("**Album**")).toBeLessThan(unsorted.indexOf("Kind of Blue"));
    expect(unsorted.indexOf("**EP**")).toBeLessThan(unsorted.indexOf("Four"));
    expect(unsorted).toContain("| 2 | Four |");
  });
});

describe("exportReadme", () => {
  test("names every part of the JSON, and its version", () => {
    const text = exportReadme(buildExport(empty(), () => true));
    // A part's name in code, alone or as the start of a path such as `tree.containers`.
    for (const key of Object.keys(exportJsonSchema().properties ?? {}))
      expect(text).toMatch(new RegExp(`\`${key}[\`.]`));
    expect(text).toContain("its version (1.0)");
    expect(text).toContain("on 2026-10-29 at 12:00 UTC");
  });
});
