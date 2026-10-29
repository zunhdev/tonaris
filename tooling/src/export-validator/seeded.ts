// A seeded export archive for the validator (TS-121), built without a database: the domain builds it from a source
// that holds every part of the format. That's albums active, in Unsorted and in Trash, lists in a folder, a folder in
// Trash with its list, every field type with values and applied-empty, links, provenance, views with a manual order,
// and units of each kind. CI validates it, so a builder change that breaks the format fails the build.

import { strToU8, zipSync } from "fflate";

import {
  appViewDefaults,
  buildExport,
  exportFiles,
  uuidv7,
  type Album,
  type ExportSource,
} from "@tonaris/domain";

const deletedAt = new Date("2026-10-20T10:00:00Z");
const expiresAt = new Date("2026-11-19T10:00:00Z");

const album = (title: string, extra: Partial<ExportSource["albums"][number]> = {}) => ({
  id: uuidv7(),
  title,
  artistCredit: "Miles Davis",
  releaseType: "album" as Album["releaseType"],
  isLive: false,
  originalYear: 1959,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: "https://coverartarchive.org/release-group/1/front-250.jpg",
  mbReleaseId: uuidv7(),
  mbReleaseGroupId: uuidv7(),
  trashedAt: null,
  trashUnitId: null,
  ...extra,
});

const container = (
  kind: "folder" | "list",
  name: string,
  extra: Partial<ExportSource["containers"][number]> = {},
) => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
  description: null,
  trashedAt: null,
  trashUnitId: null,
  ...extra,
});

/** The seeded collection, as the reader would give it. */
export function seededSource(): ExportSource {
  const folderUnit = uuidv7();
  const albumUnit = uuidv7();
  const jazz = container("folder", "Jazz", { description: "Mostly the 1950s and 60s." });
  const modal = container("list", "Modal | spiritual", { parentId: jazz.id });
  const bebop = container("list", "Bebop", { parentId: jazz.id });
  const old = container("folder", "Old", { trashedAt: deletedAt, trashUnitId: folderUnit });
  const oldList = container("list", "Old list", {
    parentId: old.id,
    trashedAt: deletedAt,
    trashUnitId: folderUnit,
  });
  const kind = album("Kind of Blue");
  const live = album("Live at the Plugged Nickel", {
    isLive: true,
    originalYear: 1982,
    recordingYearStart: 1965,
    recordingYearEnd: 1965,
    releaseType: "compilation",
  });
  const unsorted = album("Bitches Brew", {
    originalYear: null,
    releaseType: null,
    artworkUrl: null,
  });
  const gone = album("Sketches of Spain", { trashedAt: deletedAt, trashUnitId: albumUnit });
  const five = { id: uuidv7(), label: "★★★★★" };
  const [vinyl, cd] = [
    { id: uuidv7(), label: "Vinyl" },
    { id: uuidv7(), label: "CD" },
  ];
  const fields = [
    { id: uuidv7(), name: "Rating", type: "single_choice" as const, options: [five] },
    { id: uuidv7(), name: "Formats", type: "multiple_choice" as const, options: [vinyl, cd] },
    { id: uuidv7(), name: "Notes", type: "text" as const, options: [] },
    { id: uuidv7(), name: "Price", type: "number" as const, options: [] },
    { id: uuidv7(), name: "Bought on", type: "date" as const, options: [] },
    { id: uuidv7(), name: "Listened", type: "yes_no" as const, options: [] },
  ];
  const [rating, formats, notes, price, bought, listened] = fields.map((field) => field.id);
  return {
    exportedAt: new Date("2026-10-29T12:00:00Z"),
    albums: [kind, live, unsorted, gone],
    containers: [jazz, modal, bebop, old, oldList],
    memberships: [
      { listId: modal.id, albumId: kind.id },
      { listId: bebop.id, albumId: kind.id },
      { listId: bebop.id, albumId: live.id },
      { listId: oldList.id, albumId: live.id },
      { listId: bebop.id, albumId: gone.id },
    ],
    links: [
      {
        albumId: kind.id,
        service: "spotify",
        url: "https://open.spotify.com/album/1weenld61qoidwYuZ1GESA",
      },
      { albumId: kind.id, service: "apple-music", url: "https://music.apple.com/album/268443092" },
    ],
    fields,
    values: [
      { albumId: kind.id, fieldId: rating ?? "", value: five.id },
      { albumId: kind.id, fieldId: formats ?? "", value: [vinyl.id, cd.id] },
      { albumId: kind.id, fieldId: notes ?? "", value: "The one to start with." },
      { albumId: kind.id, fieldId: price ?? "", value: "24.99" },
      { albumId: kind.id, fieldId: bought ?? "", value: "2019-03-02" },
      { albumId: kind.id, fieldId: listened ?? "", value: true },
      { albumId: live.id, fieldId: notes ?? "", value: null },
    ],
    provenance: [
      { albumId: kind.id, field: "title", source: "musicbrainz" },
      { albumId: kind.id, field: "artworkUrl", source: "coverartarchive" },
      { albumId: live.id, field: "originalYear", source: "user" },
    ],
    views: [
      { viewKey: bebop.id, sortMode: "manual", sortDir: null, grouped: false, layout: "grid" },
      { viewKey: "unsorted", sortMode: null, sortDir: null, grouped: true, layout: null },
    ],
    positions: [
      { viewKey: bebop.id, itemId: live.id, key: "a0" },
      { viewKey: bebop.id, itemId: kind.id, key: "a1" },
      { viewKey: "root", itemId: jazz.id, key: "a0" },
    ],
    defaults: appViewDefaults,
    units: [
      { id: folderUnit, kind: "folder", rootId: old.id, deletedAt, expiresAt },
      { id: albumUnit, kind: "album", rootId: gone.id, deletedAt, expiresAt },
    ],
  };
}

/** The seeded collection as a ZIP, built as the API builds a download. */
export function seededArchive(source: ExportSource = seededSource()): Uint8Array {
  const data = buildExport(source, () => true);
  return zipSync(
    Object.fromEntries(exportFiles(data).map(([name, text]) => [name, strToU8(text)])),
  );
}
