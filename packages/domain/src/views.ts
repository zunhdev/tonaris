// Personal presentation (TS-11, FR-05.2, FR-11.7, FR-11.8): each person's remembered choices for a view, their
// account defaults, and the commands that change them (TON-35). The account defaults also say whether service links
// open the services' web pages or their apps (FR-06.6, TON-104), and which services the person doesn't use, whose
// empty link fields stay out of sight (TON-138). A view is the root, Unsorted, or a folder or list.
// Choices belong to the person, never to the content, and follow the same conflict policy as content (FR-09.4):
// each write names the values it replaces.

import {
  actingOwner,
  applied,
  baseProblem,
  conflict,
  isFailure,
  nothingChanged,
  staleFields,
} from "./command-kit";
import type { CollectionStore, CommandContext, CommandResult } from "./commands";
import { streamingServices, type StreamingService } from "./links";
import { failure, type Failure } from "./outcomes";
import { z } from "./zod";

/** How lists and Unsorted sort their albums (FR-05.1). */
export const listSortModes = ["year", "name", "manual"] as const;
/** How folders and the root sort their folders and lists (FR-05.1, FR-05.3). */
export const folderSortModes = ["name", "created", "manual"] as const;
export const sortModes = ["year", "name", "created", "manual"] as const;
export const sortDirections = ["asc", "desc"] as const;
/** Rows or a grid of cards, for lists and Unsorted (DS-40). */
export const viewLayouts = ["rows", "grid"] as const;
/** Where service links open: the canonical `https` page, or the service's app through its scheme (FR-06.6). */
export const linkTargets = ["web", "app"] as const;

export type ListSortMode = (typeof listSortModes)[number];
export type FolderSortMode = (typeof folderSortModes)[number];
export type SortMode = (typeof sortModes)[number];
export type SortDirection = (typeof sortDirections)[number];
export type ViewLayout = (typeof viewLayouts)[number];
export type LinkTarget = (typeof linkTargets)[number];

/** `root`, `unsorted`, or a folder's or list's ID. */
export const viewKeySchema = z
  .union([z.enum(["root", "unsorted"]), z.uuid()])
  .meta({ description: "`root`, `unsorted`, or a folder's or list's ID." });

/** The choices a person makes for one view; null follows their account default (FR-11.7). */
export const viewPrefsFieldsSchema = z.object({
  sortMode: z.enum(sortModes).nullable(),
  sortDir: z.enum(sortDirections).nullable(),
  grouped: z.boolean().nullable(),
  layout: z.enum(viewLayouts).nullable(),
});
export type ViewPrefsFields = z.infer<typeof viewPrefsFieldsSchema>;
export type ViewPrefsField = keyof ViewPrefsFields;
export const viewPrefsFields: readonly ViewPrefsField[] = viewPrefsFieldsSchema.keyof().options;

export const viewPrefsSchema = viewPrefsFieldsSchema
  .extend({ viewKey: viewKeySchema })
  .meta({ description: "A person's remembered choices for one view (FR-11.7)." });
export type ViewPrefs = z.infer<typeof viewPrefsSchema>;

/** The account defaults: what every view follows where its person made no choice (FR-11.7, DS-94). */
export const viewDefaultsSchema = z
  .object({
    listSortMode: z.enum(listSortModes),
    listSortDir: z.enum(sortDirections),
    folderSortMode: z.enum(folderSortModes),
    folderSortDir: z.enum(sortDirections),
    grouped: z.boolean(),
    layout: z.enum(viewLayouts),
  })
  .meta({ description: "A person's account defaults for presentation (FR-11.7)." });
export type ViewDefaults = z.infer<typeof viewDefaultsSchema>;
export type ViewDefaultsField = keyof ViewDefaults;
export const viewDefaultsFields: readonly ViewDefaultsField[] = viewDefaultsSchema.keyof().options;

/** DS-44's first-time defaults: lists chronological ascending, combined, in Rows; folders in manual order. */
export const appViewDefaults: ViewDefaults = {
  listSortMode: "year",
  listSortDir: "asc",
  folderSortMode: "manual",
  folderSortDir: "asc",
  grouped: false,
  layout: "rows",
};

/** The account defaults with the person's link setting, as their sessions see them (FR-06.6, TON-104). */
export const accountDefaultsSchema = viewDefaultsSchema
  .extend({
    linkTarget: z.enum(linkTargets).meta({
      description:
        "Where service links open: `web`, the canonical page, or `app`, the service's app (FR-06.6).",
    }),
    hiddenServices: z.array(z.enum(streamingServices)).meta({
      description:
        "The streaming services the person turned off, in the services' order: their empty link fields stay out of sight, while saved links still show (TON-138). Empty until they choose.",
    }),
  })
  .meta({
    description:
      "A person's account defaults for presentation (FR-11.7), where their service links open (FR-06.6), and the services they don't use (TON-138).",
  });
export type AccountDefaults = z.infer<typeof accountDefaultsSchema>;

/**
 * Until a person chooses, links open the services' web pages, which work on every device, and every service is on,
 * including one added later.
 */
export const appAccountDefaults: AccountDefaults = {
  ...appViewDefaults,
  linkTarget: "web",
  hiddenServices: [],
};

/** A view with no remembered choice. */
export function unsetView(viewKey: string): ViewPrefs {
  return { viewKey, sortMode: null, sortDir: null, grouped: null, layout: null };
}

/** The person a presentation write is for, or why it can't be made: guests and read-only agents change nothing. */
const personOf = (context: CommandContext) =>
  actingOwner(context, "collection", "You can't change view options here.");

/** What a view holds: albums for a list and Unsorted, folders and lists for a folder and the root. */
export type ViewItems = "albums" | "containers";

/**
 * What the view `viewKey` holds, if it is the person's: the root, Unsorted, or a folder or list of theirs (sharing
 * adds the containers shared with them, M7). One in Trash is still theirs, so a choice queued meanwhile isn't lost.
 * A missing folder and someone else's get the same answer.
 */
export async function viewKindOf(
  viewKey: string,
  personId: string,
  store: CollectionStore,
): Promise<ViewItems | Failure> {
  if (viewKey === "root") return "containers";
  if (viewKey === "unsorted") return "albums";
  const container = await store.findContainer(viewKey);
  // The person's own, or shared content they may read: either way the view's records are theirs (FR-07.17).
  const readable =
    container !== undefined &&
    (container.ownerId === personId || (await store.canReadShared(personId, viewKey)));
  if (!readable) return failure("not_found", "This folder or list isn't available.");
  return container.kind === "folder" ? "containers" : "albums";
}

/**
 * Remembers or clears a person's choices for one view (FR-05.2, FR-11.7). A field left out stays as it is, and null
 * clears it back to the account default. The sort is one choice: its mode and direction change together. The view
 * must be the person's (`viewKindOf`). Clearing every field forgets the view.
 */
export async function setView(
  { viewKey, ...values }: Partial<ViewPrefsFields> & { viewKey: string },
  base: Partial<ViewPrefsFields>,
  context: CommandContext,
): Promise<CommandResult> {
  const personId = personOf(context);
  if (isFailure(personId)) return personId;
  const { store } = context;

  const kind = await viewKindOf(viewKey, personId, store);
  if (isFailure(kind)) return kind;
  const folders = kind === "containers";

  const changed = viewPrefsFields.filter((field) => values[field] !== undefined);
  if (changed.length === 0) return nothingChanged();
  const unbased = baseProblem(viewPrefsFields, changed, base);
  if (unbased) return unbased;
  if ((values.sortMode === undefined) !== (values.sortDir === undefined)) {
    return failure("validation_failed", "Change the sort and its direction together.", [
      {
        path: values.sortMode === undefined ? "args.sortMode" : "args.sortDir",
        message: "Required",
      },
    ]);
  }
  if ((values.sortMode === null) !== (values.sortDir === null)) {
    return failure("validation_failed", "Set the sort and its direction, or clear both.", [
      { path: "args.sortDir", message: "Must match the sort" },
    ]);
  }
  const modes: readonly SortMode[] = folders ? folderSortModes : listSortModes;
  if (values.sortMode && !modes.includes(values.sortMode)) {
    return failure(
      "validation_failed",
      folders
        ? "Folders and the collection sort by name, creation date or manual order."
        : "Lists and Unsorted sort by year, name or manual order.",
      [{ path: "args.sortMode", message: `One of ${modes.join(", ")}` }],
    );
  }
  if (folders && ((values.grouped ?? null) !== null || (values.layout ?? null) !== null)) {
    return failure(
      "validation_failed",
      "Folders and the collection always show rows, without grouping.",
      [{ path: values.layout ? "args.layout" : "args.grouped", message: "Must be null" }],
    );
  }

  const saved = await store.findViewPrefs(personId, viewKey);
  const current = saved ?? unsetView(viewKey);
  const conflicts = staleFields(changed, current, values, base);
  if (conflicts.length > 0) return { status: "conflict", conflicts };

  const next = { ...current };
  for (const field of changed) Object.assign(next, { [field]: values[field] });
  if (viewPrefsFields.every((field) => next[field] === current[field])) return applied();
  if (viewPrefsFields.every((field) => next[field] === null)) {
    await store.deleteViewPrefs(personId, viewKey);
    return applied({ entity: "view", id: viewKey, op: "delete", data: null });
  }
  await store.saveViewPrefs(personId, next);
  return applied({ entity: "view", id: viewKey, op: saved ? "update" : "insert", data: next });
}

/**
 * Changes a person's account defaults (FR-11.7, DS-94). Remembered choices are untouched, so views that have their
 * own keep them. Until saved, the defaults are DS-44's.
 */
export async function setDefaults(
  values: Partial<ViewDefaults>,
  base: Partial<ViewDefaults>,
  context: CommandContext,
): Promise<CommandResult> {
  const personId = personOf(context);
  if (isFailure(personId)) return personId;
  const { store } = context;

  const changed = viewDefaultsFields.filter((field) => values[field] !== undefined);
  if (changed.length === 0) return nothingChanged();
  const unbased = baseProblem(viewDefaultsFields, changed, base);
  if (unbased) return unbased;

  const current = (await store.findDefaults(personId)) ?? appAccountDefaults;
  const conflicts = staleFields(changed, current, values, base);
  if (conflicts.length > 0) return { status: "conflict", conflicts };

  const next = { ...current };
  for (const field of changed) Object.assign(next, { [field]: values[field] });
  if (viewDefaultsFields.every((field) => next[field] === current[field])) return applied();
  await store.saveDefaults(personId, next);
  return applied({ entity: "defaults", id: personId, op: "update", data: next });
}

/** Services in the services' order, each once. */
const inOrder = (services: readonly StreamingService[]): StreamingService[] =>
  streamingServices.filter((service) => services.includes(service));

/**
 * Sets the streaming services a person turned off (TON-138): the album panel and the New album form leave out their
 * empty link fields, on every device, while saved links still show. `base` holds the prior list (TS-21).
 */
export async function setHiddenServices(
  values: { hiddenServices: readonly StreamingService[] },
  base: { hiddenServices: readonly StreamingService[] },
  context: CommandContext,
): Promise<CommandResult> {
  const personId = personOf(context);
  if (isFailure(personId)) return personId;
  const { store } = context;

  const current = (await store.findDefaults(personId)) ?? appAccountDefaults;
  const before = inOrder(current.hiddenServices).join(",");
  if (before !== inOrder(base.hiddenServices).join(",")) {
    return conflict(
      "hiddenServices",
      current.hiddenServices,
      values.hiddenServices,
      base.hiddenServices,
    );
  }
  const hiddenServices = inOrder(values.hiddenServices);
  if (hiddenServices.join(",") === before) return applied();
  const next = { ...current, hiddenServices };
  await store.saveDefaults(personId, next);
  return applied({ entity: "defaults", id: personId, op: "update", data: next });
}

/**
 * Sets where a person's service links open (FR-06.6, TON-104): their web pages or the services' apps, on every
 * device. Until saved, they open the web pages.
 */
export async function setLinkTarget(
  values: { linkTarget: LinkTarget },
  base: { linkTarget: LinkTarget },
  context: CommandContext,
): Promise<CommandResult> {
  const personId = personOf(context);
  if (isFailure(personId)) return personId;
  const { store } = context;

  const current = (await store.findDefaults(personId)) ?? appAccountDefaults;
  const conflicts = staleFields(["linkTarget"], current, values, base);
  if (conflicts.length > 0) return { status: "conflict", conflicts };
  if (values.linkTarget === current.linkTarget) return applied();
  const next = { ...current, linkTarget: values.linkTarget };
  await store.saveDefaults(personId, next);
  return applied({ entity: "defaults", id: personId, op: "update", data: next });
}
