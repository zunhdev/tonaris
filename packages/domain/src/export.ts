// The data export's model (FR-08.3–FR-08.5, TS-81): `tonaris-export.json` v1, built purely from one owner's saved
// collection, and its JSON Schema. The reader in `@tonaris/db` fills the source from the owner's collection tables
// only, and the source has no place for accounts, sharing, references or credentials, so they stay out by
// construction (FR-08.4). Each album appears once; lists reference albums by ID; Trash is included and marked.
// Unknown is null, an unused field is absent, and an applied-empty field is null (FR-08.3).

import { albumFieldsSchema, artworkUrlSchema, type Album } from "./albums";
import { containerKinds, type Container } from "./containers";
import { provenanceSources, type ProvenanceSource } from "./enrichment";
import type { FieldValue } from "./field-values";
import { fieldTypes, type CustomField } from "./fields";
import { streamingServices } from "./links";
import { byBytes } from "./order";
import type { Position } from "./positions";
import type { ServiceLink } from "./service-links";
import { trashUnitKinds, type TrashUnitKind } from "./trash";
import {
  viewDefaultsSchema,
  viewKeySchema,
  viewPrefsFieldsSchema,
  type ViewDefaults,
  type ViewPrefs,
} from "./views";
import { z } from "./zod";

export const exportFormat = "tonaris-export";
/** Semver: a minor version only adds fields (TS-81). */
export const exportFormatVersion = "1.0";

/** What replaces a value a provider's policy keeps out of exports and from agents (TS-15, FR-08.8). */
export const withheld = { withheld: "provider-policy" } as const;
export type Withheld = { withheld: typeof withheld.withheld };

const withheldSchema = z
  .object({ withheld: z.literal(withheld.withheld) })
  .meta({ description: "A value its source's terms keep out of exports (TS-15)." });

/** `schema`, or the marker for a value a policy withholds. */
const sourced = <T extends z.ZodType>(schema: T) => z.union([schema, withheldSchema]);

/** The values that record where they came from (TS-15): the person's fields and the artwork. */
const sourcedValues = [
  ...albumFieldsSchema.keyof().options,
  "artworkUrl",
] as const satisfies readonly (keyof Album)[];
type SourcedValue = (typeof sourcedValues)[number];
const isSourcedValue = (field: string): field is SourcedValue =>
  (sourcedValues as readonly string[]).includes(field);

const statusSchema = z
  .enum(["active", "trashed"])
  .meta({ description: "`trashed`: in Trash, in the unit `trashUnitId` (FR-01.11)." });

const choiceSchema = z.object({ optionId: z.uuid(), label: z.string() });

const exportValueSchema = z
  .union([z.string(), z.boolean(), choiceSchema, z.array(choiceSchema)])
  .nullable()
  .meta({
    description:
      "Text; a number as a decimal string; a `YYYY-MM-DD` date; true or false; a choice as `{ optionId, label }`, or a list of them. Null is applied-empty.",
  });

const metadata = albumFieldsSchema.shape;

const albumSchema = z.object({
  id: z.uuid(),
  title: sourced(metadata.title),
  artistCredit: sourced(metadata.artistCredit),
  releaseType: sourced(metadata.releaseType),
  isLive: sourced(metadata.isLive),
  originalYear: sourced(metadata.originalYear),
  recordingYearStart: sourced(metadata.recordingYearStart),
  recordingYearEnd: sourced(metadata.recordingYearEnd),
  artworkUrl: sourced(artworkUrlSchema),
  serviceLinks: z
    .partialRecord(z.enum(streamingServices), z.string())
    .meta({ description: "The album's canonical link on each service it has one for (FR-06.2)." }),
  identifiers: z.object({
    musicbrainzRelease: z.uuid().nullable(),
    musicbrainzReleaseGroup: z.uuid().nullable(),
  }),
  fields: z
    .record(
      z.uuid(),
      z.object({ name: z.string(), type: z.enum(fieldTypes), value: exportValueSchema }),
    )
    .meta({
      description: "The custom fields the album applies, by field ID; an unused one is absent.",
    }),
  status: statusSchema,
  trashUnitId: z.uuid().nullable(),
  provenance: z.partialRecord(z.enum(sourcedValues), z.enum(provenanceSources)).meta({
    description: "Where each value came from, for the values whose source is recorded (TS-15).",
  }),
});
export type ExportAlbum = z.infer<typeof albumSchema>;

const containerSchema = z.object({
  id: z.uuid(),
  kind: z.enum(containerKinds),
  name: z.string(),
  description: z.string().nullable(),
  parentId: z.uuid().nullable(),
  albumIds: z.array(z.uuid()).meta({
    description:
      "A list's albums, Trash included, in the order they were added; none for a folder.",
  }),
  status: statusSchema,
  trashUnitId: z.uuid().nullable(),
});

const viewSchema = viewPrefsFieldsSchema.extend({
  order: z.array(z.uuid()).meta({
    description: "The person's manual order of the view's items, if they arranged it (FR-05.2).",
  }),
});

const unitSchema = z.object({
  id: z.uuid(),
  kind: z.enum(trashUnitKinds),
  rootId: z.uuid().meta({ description: "The folder, list or album deleted." }),
  deletedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  containerIds: z.array(z.uuid()).meta({ description: "The folders and lists deleted together." }),
  albumIds: z.array(z.uuid()).meta({ description: "The album deleted, for an album's unit." }),
  formerMemberships: z
    .array(z.object({ listId: z.uuid(), albumId: z.uuid() }))
    .meta({ description: "The list entries recovery brings back (FR-01.14)." }),
});

export const exportSchema = z
  .object({
    format: z.literal(exportFormat),
    formatVersion: z.literal(exportFormatVersion),
    exportedAt: z.iso.datetime(),
    conventions: z.object({
      unknown: z.string(),
      unusedField: z.string(),
      appliedEmpty: z.string(),
      dates: z.string(),
      numbers: z.string(),
    }),
    accountDefaults: viewDefaultsSchema,
    fields: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        type: z.enum(fieldTypes),
        options: z.array(z.object({ id: z.uuid(), label: z.string() })),
      }),
    ),
    albums: z.array(albumSchema),
    tree: z.object({ containers: z.array(containerSchema) }),
    personal: z.object({
      views: z
        .record(viewKeySchema, viewSchema)
        .meta({ description: "By view: `root`, `unsorted`, or a folder's or list's ID." }),
    }),
    trash: z.object({ units: z.array(unitSchema) }),
  })
  .meta({
    title: "Tonaris export",
    description: "One owner's whole collection at one point in time (FR-08, TS-81).",
  });
export type TonarisExport = z.infer<typeof exportSchema>;
export type ExportValue = z.infer<typeof exportValueSchema>;

/**
 * The export's JSON Schema (2020-12), written into the archive beside the data (TS-80). It is made on demand, as
 * the web app imports the domain too.
 */
export const exportJsonSchema = () => z.toJSONSchema(exportSchema, { target: "draft-2020-12" });

/** One owner's saved collection as the reader gives it: what the export is built from, and nothing else. */
export type ExportSource = {
  exportedAt: Date;
  albums: (Album & {
    mbReleaseId: string | null;
    mbReleaseGroupId: string | null;
    trashedAt: Date | null;
    trashUnitId: string | null;
  })[];
  containers: (Container & { trashedAt: Date | null; trashUnitId: string | null })[];
  /** Every saved entry, Trash included, in the order they were added. */
  memberships: { listId: string; albumId: string }[];
  links: ServiceLink[];
  fields: CustomField[];
  values: FieldValue[];
  provenance: { albumId: string; field: string; source: ProvenanceSource }[];
  views: ViewPrefs[];
  positions: Position[];
  defaults: ViewDefaults;
  units: { id: string; kind: TrashUnitKind; rootId: string; deletedAt: Date; expiresAt: Date }[];
};

/** Groups `items` by `keyOf`, keeping their order. */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** A stored value in the export's terms: choices carry their labels (TS-81). */
function valueOf(field: CustomField, value: FieldValue["value"]): ExportValue {
  if (value === null || typeof value === "boolean") return value;
  const choice = (optionId: string) => ({
    optionId,
    label: field.options.find((option) => option.id === optionId)?.label ?? "",
  });
  if (Array.isArray(value)) return value.map(choice);
  return field.type === "single_choice" ? choice(value) : value;
}

/**
 * The export of `source`. `exportable` is the provider policy (TS-15): a value from a source it refuses becomes the
 * `withheld` marker.
 */
export function buildExport(
  source: ExportSource,
  exportable: (source: ProvenanceSource) => boolean,
): TonarisExport {
  const fieldsById = new Map(source.fields.map((field) => [field.id, field]));
  const linksOf = groupBy(source.links, (link) => link.albumId);
  const valuesOf = groupBy(source.values, (value) => value.albumId);
  const sourcesOf = groupBy(source.provenance, (entry) => entry.albumId);
  const entriesOf = groupBy(source.memberships, (entry) => entry.listId);
  const positionsOf = groupBy(source.positions, (position) => position.viewKey);
  const containersOf = groupBy(
    source.containers.filter((container) => container.trashUnitId !== null),
    (container) => container.trashUnitId ?? "",
  );
  const albumsOf = groupBy(
    source.albums.filter((album) => album.trashUnitId !== null),
    (album) => album.trashUnitId ?? "",
  );

  const albums = source.albums.map((album): ExportAlbum => {
    const provenance: ExportAlbum["provenance"] = {};
    for (const entry of sourcesOf.get(album.id) ?? [])
      if (isSourcedValue(entry.field)) provenance[entry.field] = entry.source;
    /** The album's value, or the marker where its source's policy refuses exports. */
    const kept = <K extends SourcedValue>(key: K): Album[K] | Withheld => {
      const from = provenance[key];
      return from === undefined || exportable(from) ? album[key] : withheld;
    };
    const fields: ExportAlbum["fields"] = {};
    for (const applied of valuesOf.get(album.id) ?? []) {
      const field = fieldsById.get(applied.fieldId);
      if (field)
        fields[field.id] = {
          name: field.name,
          type: field.type,
          value: valueOf(field, applied.value),
        };
    }
    return {
      id: album.id,
      title: kept("title"),
      artistCredit: kept("artistCredit"),
      releaseType: kept("releaseType"),
      isLive: kept("isLive"),
      originalYear: kept("originalYear"),
      recordingYearStart: kept("recordingYearStart"),
      recordingYearEnd: kept("recordingYearEnd"),
      artworkUrl: kept("artworkUrl"),
      serviceLinks: Object.fromEntries(
        (linksOf.get(album.id) ?? []).map((link) => [link.service, link.url]),
      ),
      identifiers: {
        musicbrainzRelease: album.mbReleaseId,
        musicbrainzReleaseGroup: album.mbReleaseGroupId,
      },
      fields,
      status: album.trashedAt === null ? "active" : "trashed",
      trashUnitId: album.trashUnitId,
      provenance,
    };
  });

  const views: TonarisExport["personal"]["views"] = {};
  for (const prefs of source.views) {
    const { viewKey, ...choices } = prefs;
    views[viewKey] = { ...choices, order: [] };
  }
  for (const [viewKey, placed] of positionsOf) {
    // Fractional-index keys compare bytewise (TS-16).
    const order = placed
      .toSorted((a, b) => byBytes(a.key, b.key))
      .map((position) => position.itemId);
    views[viewKey] = {
      ...(views[viewKey] ?? { sortMode: null, sortDir: null, grouped: null, layout: null }),
      order,
    };
  }

  return {
    format: exportFormat,
    formatVersion: exportFormatVersion,
    exportedAt: source.exportedAt.toISOString(),
    conventions: {
      unknown: "null",
      unusedField: "field absent from album.fields",
      appliedEmpty: "field present in album.fields with value null",
      dates: "ISO 8601",
      numbers: "custom-field numbers are decimal strings, exact as saved",
    },
    accountDefaults: source.defaults,
    fields: source.fields.map(({ id, name, type, options }) => ({ id, name, type, options })),
    albums,
    tree: {
      containers: source.containers.map((container) => ({
        id: container.id,
        kind: container.kind,
        name: container.name,
        description: container.description,
        parentId: container.parentId,
        albumIds:
          container.kind === "list"
            ? (entriesOf.get(container.id) ?? []).map((entry) => entry.albumId)
            : [],
        status: container.trashedAt === null ? "active" : "trashed",
        trashUnitId: container.trashUnitId,
      })),
    },
    personal: { views },
    trash: {
      units: source.units.map((unit) => {
        const containerIds = (containersOf.get(unit.id) ?? []).map((container) => container.id);
        const albumIds = (albumsOf.get(unit.id) ?? []).map((album) => album.id);
        const lists = new Set(containerIds);
        const members = new Set(albumIds);
        return {
          id: unit.id,
          kind: unit.kind,
          rootId: unit.rootId,
          deletedAt: unit.deletedAt.toISOString(),
          expiresAt: unit.expiresAt.toISOString(),
          containerIds,
          albumIds,
          formerMemberships: source.memberships
            .filter((entry) => lists.has(entry.listId) || members.has(entry.albumId))
            .map(({ listId, albumId }) => ({ listId, albumId })),
        };
      }),
    },
  };
}
