// The export builder (FR-08.3–FR-08.5, TS-81) on a small collection: each album once, the three kinds of empty,
// choice labels, Trash units and their former memberships, the manual order, the policy's marker, and the output
// passing its own schema.

import { describe, expect, test } from "bun:test";

import type { Album } from "./albums";
import { buildExport, exportJsonSchema, exportSchema, withheld, type ExportSource } from "./export";
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
  ...extra,
  mbReleaseId: null,
  mbReleaseGroupId: null,
  trashedAt: null,
  trashUnitId: null,
});

const list = (name: string, parentId: string | null = null) => ({
  id: uuidv7(),
  kind: "list" as const,
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

const everything = () => true;

describe("buildExport", () => {
  test("an album in two lists appears once, and both lists reference it", () => {
    const kind = album("Kind of Blue");
    const jazz = list("Jazz");
    const favourites = list("Favourites");
    const source = {
      ...empty(),
      albums: [kind],
      containers: [jazz, favourites],
      memberships: [
        { listId: jazz.id, albumId: kind.id },
        { listId: favourites.id, albumId: kind.id },
      ],
    };
    const result = exportSchema.parse(buildExport(source, everything));
    expect(result.albums.map((each) => each.id)).toEqual([kind.id]);
    expect(result.tree.containers.map((each) => each.albumIds)).toEqual([[kind.id], [kind.id]]);
    expect(result).toMatchObject({
      format: "tonaris-export",
      formatVersion: "1.0",
      exportedAt: "2026-10-29T12:00:00.000Z",
    });
  });

  test("unknown, unused and applied-empty stay distinct, and choices carry their labels", () => {
    const kind = album("Kind of Blue", { originalYear: null });
    const five = { id: uuidv7(), label: "★★★★★" };
    const vinyl = { id: uuidv7(), label: "Vinyl" };
    const cd = { id: uuidv7(), label: "CD" };
    const fields = [
      { id: uuidv7(), name: "Rating", type: "single_choice" as const, options: [five] },
      { id: uuidv7(), name: "Notes", type: "text" as const, options: [] },
      { id: uuidv7(), name: "Formats", type: "multiple_choice" as const, options: [vinyl, cd] },
      { id: uuidv7(), name: "Price", type: "number" as const, options: [] },
      { id: uuidv7(), name: "Unused", type: "yes_no" as const, options: [] },
    ];
    const [rating, notes, formats, price] = fields;
    const source = {
      ...empty(),
      albums: [kind],
      fields,
      values: [
        { albumId: kind.id, fieldId: rating!.id, value: five.id },
        { albumId: kind.id, fieldId: notes!.id, value: null },
        { albumId: kind.id, fieldId: formats!.id, value: [vinyl.id, cd.id] },
        { albumId: kind.id, fieldId: price!.id, value: "12.50" },
      ],
    };
    const [result] = exportSchema.parse(buildExport(source, everything)).albums;
    expect(result?.originalYear).toBeNull();
    expect(result?.fields).toEqual({
      [rating!.id]: {
        name: "Rating",
        type: "single_choice",
        value: { optionId: five.id, label: "★★★★★" },
      },
      [notes!.id]: { name: "Notes", type: "text", value: null },
      [formats!.id]: {
        name: "Formats",
        type: "multiple_choice",
        value: [
          { optionId: vinyl.id, label: "Vinyl" },
          { optionId: cd.id, label: "CD" },
        ],
      },
      [price!.id]: { name: "Price", type: "number", value: "12.50" },
    });
  });

  test("Trash is marked, and a unit gives its contents and the entries recovery brings back", () => {
    const unitId = uuidv7();
    const kind = album("Kind of Blue");
    const gone = album("Sketches of Spain", { title: "Sketches of Spain" });
    const deleted = {
      ...list("Old"),
      trashedAt: new Date("2026-10-20T00:00:00Z"),
      trashUnitId: unitId,
    };
    const albumUnit = uuidv7();
    const trashed = {
      ...gone,
      trashedAt: new Date("2026-10-21T00:00:00Z"),
      trashUnitId: albumUnit,
    };
    const kept = list("Kept");
    const source = {
      ...empty(),
      albums: [kind, trashed],
      containers: [deleted, kept],
      memberships: [
        { listId: deleted.id, albumId: kind.id },
        { listId: kept.id, albumId: trashed.id },
      ],
      units: [
        {
          id: unitId,
          kind: "list" as const,
          rootId: deleted.id,
          deletedAt: new Date("2026-10-20T00:00:00Z"),
          expiresAt: new Date("2026-11-19T00:00:00Z"),
        },
        {
          id: albumUnit,
          kind: "album" as const,
          rootId: trashed.id,
          deletedAt: new Date("2026-10-21T00:00:00Z"),
          expiresAt: new Date("2026-11-20T00:00:00Z"),
        },
      ],
    };
    const result = exportSchema.parse(buildExport(source, everything));
    expect(result.tree.containers[0]).toMatchObject({ status: "trashed", trashUnitId: unitId });
    expect(result.albums.map((each) => each.status)).toEqual(["active", "trashed"]);
    expect(result.trash.units).toEqual([
      {
        id: unitId,
        kind: "list",
        rootId: deleted.id,
        deletedAt: "2026-10-20T00:00:00.000Z",
        expiresAt: "2026-11-19T00:00:00.000Z",
        containerIds: [deleted.id],
        albumIds: [],
        formerMemberships: [{ listId: deleted.id, albumId: kind.id }],
      },
      {
        id: albumUnit,
        kind: "album",
        rootId: trashed.id,
        deletedAt: "2026-10-21T00:00:00.000Z",
        expiresAt: "2026-11-20T00:00:00.000Z",
        containerIds: [],
        albumIds: [trashed.id],
        formerMemberships: [{ listId: kept.id, albumId: trashed.id }],
      },
    ]);
  });

  test("a view keeps its choices and the manual order, by key", () => {
    const [a, b, c] = [album("A"), album("B"), album("C")];
    const jazz = list("Jazz");
    const source = {
      ...empty(),
      albums: [a, b, c],
      containers: [jazz],
      views: [
        {
          viewKey: jazz.id,
          sortMode: "manual" as const,
          sortDir: null,
          grouped: false,
          layout: "grid" as const,
        },
      ],
      positions: [
        { viewKey: jazz.id, itemId: a.id, key: "a2" },
        { viewKey: jazz.id, itemId: b.id, key: "a0" },
        { viewKey: "unsorted", itemId: c.id, key: "a0" },
      ],
    };
    const { views } = exportSchema.parse(buildExport(source, everything)).personal;
    expect(views[jazz.id]).toEqual({
      sortMode: "manual",
      sortDir: null,
      grouped: false,
      layout: "grid",
      order: [b.id, a.id],
    });
    expect(views.unsorted).toEqual({
      sortMode: null,
      sortDir: null,
      grouped: null,
      layout: null,
      order: [c.id],
    });
  });

  test("a value from a source the policy refuses is marked, and the others stay", () => {
    const kind = album("Kind of Blue", { artworkUrl: "https://coverartarchive.org/1.jpg" });
    const source = {
      ...empty(),
      albums: [kind],
      provenance: [
        { albumId: kind.id, field: "title", source: "musicbrainz" as const },
        { albumId: kind.id, field: "artworkUrl", source: "coverartarchive" as const },
      ],
    };
    const [result] = exportSchema.parse(
      buildExport(source, (from) => from !== "musicbrainz"),
    ).albums;
    expect(result?.title).toEqual(withheld);
    expect(result?.artworkUrl).toBe("https://coverartarchive.org/1.jpg");
    expect(result?.artistCredit).toBe("Miles Davis");
    expect(result?.provenance).toEqual({ title: "musicbrainz", artworkUrl: "coverartarchive" });
  });

  test("the JSON Schema is 2020-12 and names every top-level part", () => {
    expect(exportJsonSchema().$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(Object.keys(exportJsonSchema().properties ?? {})).toEqual([
      "format",
      "formatVersion",
      "exportedAt",
      "conventions",
      "accountDefaults",
      "fields",
      "albums",
      "tree",
      "personal",
      "trash",
    ]);
  });
});
