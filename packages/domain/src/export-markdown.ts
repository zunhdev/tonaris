// The export's readable rendering (FR-08.2, TS-82): `collection.md`, made from the export model, so it never says
// anything the JSON doesn't. The folder tree becomes headings and each list a table, in the owner's arrangement: the
// sort, grouping and manual order the app shows them (`presentationOf`, `sortAlbums`, `sortContainers`). Unsorted and
// Trash follow as their own sections, Trash with each unit's deletion and expiry dates.

import type { ExportAlbum, ExportValue, TonarisExport, Withheld } from "./export";
import { serviceNames, streamingServices } from "./links";
import {
  chronology,
  groupNames,
  groupOf,
  sections,
  sortAlbums,
  sortContainers,
  type Keys,
} from "./order";
import { presentationOf } from "./presentation";
import type { ViewPrefs } from "./views";

type Container = TonarisExport["tree"]["containers"][number];
type Field = TonarisExport["fields"][number];

/** An album as the tables show it: a withheld value reads as unknown, and the title says so. */
type Row = {
  id: string;
  title: string;
  artistCredit: string;
  releaseType: "album" | "ep" | "compilation" | null;
  isLive: boolean | null;
  originalYear: number | null;
  recordingYearStart: number | null;
  recordingYearEnd: number | null;
  album: ExportAlbum;
};

const isWithheld = (value: unknown): value is Withheld =>
  typeof value === "object" && value !== null && "withheld" in value;
const plain = <T>(value: T | Withheld): T | null => (isWithheld(value) ? null : value);

/** `text` safe in a heading, paragraph or table cell: Markdown's marks escaped, and on one line. */
const md = (text: string) => text.replace(/[\\`*_[\]<>|#]/g, "\\$&").replace(/\s*\n\s*/g, " ");

const dateOf = (iso: string) => iso.slice(0, 10);

const active = (container: Container) => container.status === "active";
const activeAlbum = (row: Row) => row.album.status === "active";

function rowOf(album: ExportAlbum): Row {
  return {
    id: album.id,
    title: plain(album.title) ?? "(withheld)",
    artistCredit: plain(album.artistCredit) ?? "(withheld)",
    releaseType: plain(album.releaseType),
    isLive: plain(album.isLive),
    originalYear: plain(album.originalYear),
    recordingYearStart: plain(album.recordingYearStart),
    recordingYearEnd: plain(album.recordingYearEnd),
    album,
  };
}

/** A field's value in a cell: empty when unused, "—" when applied empty. */
function cellOf(value: ExportValue): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return md(value);
  if (Array.isArray(value)) return value.map((choice) => md(choice.label)).join(", ");
  return md(value.label);
}

function yearOf(row: Row): string {
  const { year, recorded } = chronology(row);
  return recorded ? `rec. ${year}` : year;
}

function linksOf(album: ExportAlbum): string {
  return streamingServices
    .flatMap((service) => {
      const url = album.serviceLinks[service];
      return url ? [`[${serviceNames[service]}](${url.replaceAll(")", "%29")})`] : [];
    })
    .join(" · ");
}

/** A table of `rows`, numbered from `from`, with a column for each field any of them applies. */
function table(rows: readonly Row[], fields: readonly Field[], from = 1): string[] {
  const used = fields.filter((field) => rows.some((row) => field.id in row.album.fields));
  const header = [
    "#",
    "Title",
    "Artist",
    "Year",
    "Type",
    "Links",
    ...used.map((field) => md(field.name)),
  ];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map((_, index) => (index === 0 ? "--:" : "---")).join(" | ")} |`,
  ];
  rows.forEach((row, index) => {
    const cells = [
      String(from + index),
      md(row.title),
      md(row.artistCredit),
      yearOf(row),
      groupNames[groupOf(row)],
      linksOf(row.album),
      ...used.map((field) => {
        const applied = row.album.fields[field.id];
        return applied ? cellOf(applied.value) : "";
      }),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  });
  return lines;
}

/** `collection.md`: the export as a readable outline (TS-82). */
export function renderCollection(data: TonarisExport): string {
  const rows = new Map(data.albums.map((album) => [album.id, rowOf(album)]));
  const containers = new Map(data.tree.containers.map((container) => [container.id, container]));
  const defaults = data.accountDefaults;

  const prefsOf = (viewKey: string): ViewPrefs | undefined => {
    const view = data.personal.views[viewKey];
    return (
      view && {
        viewKey,
        sortMode: view.sortMode,
        sortDir: view.sortDir,
        grouped: view.grouped,
        layout: view.layout,
      }
    );
  };
  const keysOf = (viewKey: string): Keys =>
    new Map(
      (data.personal.views[viewKey]?.order ?? []).map((id, index) => [
        id,
        String(index).padStart(6, "0"),
      ]),
    );

  /** The view's albums, given in its fallback order, sorted and grouped as the app shows them. */
  function albumLines(viewKey: string, inFallback: readonly Row[]): string[] {
    if (inFallback.length === 0) return ["_No albums._"];
    const view = presentationOf("albums", prefsOf(viewKey), defaults);
    const sorted = sortAlbums(
      inFallback,
      { mode: view.sortMode, dir: view.sortDir },
      keysOf(viewKey),
    );
    const lines: string[] = [];
    let from = 1;
    for (const section of sections(sorted, view.grouped)) {
      if (section.group) lines.push(`**${groupNames[section.group]}**`, "");
      lines.push(...table(section.albums, data.fields, from), "");
      from += section.albums.length;
    }
    return lines.slice(0, -1);
  }

  /**
   * A folder or list and what it holds, as a heading at `depth`; `inScope` picks its children. Markdown stops at six
   * levels, so a heading there names its ancestors from that level down, in `trail`.
   */
  function containerLines(
    container: Container,
    depth: number,
    inScope: (child: Container) => boolean,
    albumIn: (row: Row) => boolean,
    trail: readonly string[] = [],
  ): string[] {
    const name = [...trail, container.name].map(md).join(" › ");
    const lines = [`${"#".repeat(Math.min(depth, 6))} ${name}`, ""];
    if (container.description) lines.push(md(container.description), "");
    if (container.kind === "list") {
      const listed = container.albumIds.flatMap((id) => rows.get(id) ?? []).filter(albumIn);
      lines.push(...albumLines(container.id, listed), "");
      return lines;
    }
    const children = data.tree.containers.filter(
      (child) => child.parentId === container.id && inScope(child),
    );
    if (children.length === 0) return [...lines, "_Empty folder._", ""];
    for (const child of childrenInOrder(container.id, children))
      lines.push(
        ...containerLines(
          child,
          depth + 1,
          inScope,
          albumIn,
          depth >= 6 ? [...trail, container.name] : [],
        ),
      );
    return lines;
  }

  function childrenInOrder(viewKey: string, children: readonly Container[]): Container[] {
    const view = presentationOf("containers", prefsOf(viewKey), defaults);
    return sortContainers(children, { mode: view.sortMode, dir: view.sortDir }, keysOf(viewKey));
  }

  const listed = new Set(
    data.tree.containers
      .filter((container) => container.kind === "list" && active(container))
      .flatMap((list) => list.albumIds),
  );
  const unsorted = data.albums
    .filter((album) => album.status === "active" && !listed.has(album.id))
    // Newest first, an inbox: its fallback order (DS-51). UUIDv7 IDs hold when each was made.
    .toSorted((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .map(rowOf);

  const activeCount = data.albums.filter((album) => album.status === "active").length;
  const lines = [
    "# Your Tonaris collection",
    "",
    `Exported on ${dateOf(data.exportedAt)} at ${data.exportedAt.slice(11, 16)} UTC: ${activeCount.toLocaleString("en")} albums, and ${(data.albums.length - activeCount).toLocaleString("en")} in Trash. This is a readable outline; \`tonaris-export.json\` is the complete data, and \`README.md\` explains both.`,
    "",
  ];

  const roots = data.tree.containers.filter(
    (container) => container.parentId === null && active(container),
  );
  for (const root of childrenInOrder("root", roots))
    lines.push(...containerLines(root, 2, active, activeAlbum));

  lines.push("## Unsorted", "", ...albumLines("unsorted", unsorted), "");

  lines.push("## Trash", "");
  if (data.trash.units.length === 0) lines.push("_Trash is empty._", "");
  else
    lines.push(
      "Each item comes back only if it's recovered in Tonaris before the date it's deleted for good.",
      "",
    );
  for (const unit of data.trash.units) {
    const root = containers.get(unit.rootId);
    const album = rows.get(unit.rootId);
    const name = root?.name ?? album?.title ?? "";
    lines.push(
      `### ${md(name)} (${unit.kind})`,
      "",
      `Deleted on ${dateOf(unit.deletedAt)}; deleted for good on ${dateOf(unit.expiresAt)}.`,
      "",
    );
    if (root) {
      const inUnit = (child: Container) => child.trashUnitId === unit.id;
      lines.push(...containerLines(root, 4, inUnit, () => true).slice(2));
    } else if (album) lines.push(...table([album], data.fields), "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
