// Copying a share into one's own collection (FR-07.22, AC-51; TON-133). Anyone who can open a shared folder or list
// copies it, with what is inside, under one of their folders or at the top level: a snapshot that is then simply
// theirs, with nothing recording where it came from. Albums they already have are reused by release group, else by
// service link (TS-44), and join the copied lists keeping their own details; albums with neither are copied as new.
// The owner's custom fields map onto theirs by name and type, created when missing, with only the options the copied
// albums use; a field of the same name but another type isn't copied. Their own manual order and view choices of the
// share's views come along. It is all or nothing: the plan counts what it adds against FR-15's limits first, and the
// preview shows the same plan before anything is written.

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

import { albumOf, type Album } from "./albums";
import type { CapturedLink } from "./capture";
import type { CollectionStore } from "./collection-store";
import { actingOwner, applied, isFailure } from "./command-kit";
import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import { exceedsMaxDepth } from "./container-tree";
import { containerNameProblem, destinationPath, nameTakenProblem } from "./containers";
import type { Container } from "./containers";
import { fieldValueKey, type FieldValue, type FieldValueData } from "./field-values";
import type { CustomField, FieldOption } from "./fields";
import { uuidv7 } from "./ids";
import {
  maxAlbums,
  maxContainerDepth,
  maxContainers,
  maxFieldOptions,
  maxFields,
  maxMemberships,
} from "./limits";
import { membershipKey, type Membership } from "./memberships";
import { findNameConflict } from "./names";
import { nameKey } from "./normalize";
import { failure, type Failure } from "./outcomes";
import { positionKey, type Position } from "./positions";
import { serviceLinkKey } from "./service-links";
import type { ViewPrefs } from "./views";
import { z } from "./zod";

/** `share.copy`'s arguments (FR-07.22). */
export const shareCopyArgsSchema = z.object({
  containerId: z.uuid().meta({
    description:
      "The shared folder or list to copy: the top of a share the person can open, or anything inside it.",
  }),
  copyId: z
    .uuid({ version: "v7" })
    .meta({ description: "The copy's ID, chosen by the client (TS-10)." }),
  parentId: z.uuid().nullable().meta({
    description: "Where the copy goes: one of the person's folders, or null for the top level.",
  }),
  name: z.string().meta({
    description:
      "The copy's name: the original's, or another where that one is taken there (X-06).",
  }),
});
export type ShareCopyArgs = z.infer<typeof shareCopyArgsSchema>;

/** What a copy adds before it runs, and why it can't, if it can't (FR-07.22). */
export const shareCopyPreviewSchema = z
  .object({
    folders: z.int().nonnegative(),
    lists: z.int().nonnegative(),
    albums: z.int().nonnegative().meta({ description: "Albums the copy adds." }),
    reused: z.int().nonnegative().meta({
      description: "Albums the person has already, which join the copied lists instead.",
    }),
    fields: z.int().nonnegative().meta({ description: "Custom fields the copy creates." }),
    skippedFields: z.array(z.string()).meta({
      description: "Fields not copied: the person has a field of the same name but another type.",
    }),
    problems: z.array(z.string()).meta({
      description: "Each limit the copy would exceed, and by how much; empty when it fits.",
    }),
  })
  .meta({ description: "What copying a shared folder or list adds (FR-07.22)." });
export type ShareCopyPreview = z.infer<typeof shareCopyPreviewSchema>;

/** `share.copy`'s confirmed result: the copy's ID and its albums, added and reused. */
export const shareCopyResultSchema = z.object({
  containerId: z.uuid(),
  albums: z.int().nonnegative(),
  reused: z.int().nonnegative(),
});

/** A source album: added as a new one of the person's, or reused, theirs already. */
type AlbumPlan =
  | { kind: "new"; id: string; album: Album; releaseGroupId: string | null }
  | {
      kind: "reused";
      id: string;
    };

/** A field the copy needs: one of the person's, perhaps with options to add, or a new one. */
type FieldPlan = {
  field: CustomField;
  created: boolean;
  /** Options to add to the person's field, which it lacks. */
  added: FieldOption[];
  /** The owner's option IDs to the person's. */
  options: Map<string, string>;
};

/** Everything a copy writes, worked out before anything is, with what it counts against the limits. */
export type ShareCopyPlan = {
  preview: ShareCopyPreview;
  containers: Container[];
  albums: Map<string, AlbumPlan>;
  links: (CapturedLink & { albumId: string })[];
  entries: Membership[];
  fields: Map<string, FieldPlan>;
  values: FieldValue[];
  positions: Position[];
  views: ViewPrefs[];
};

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** Why a copy can't be read: the same for a folder that doesn't exist and one the person can't open. */
const unavailable = (): Failure =>
  failure("not_found", "This shared folder or list isn't available.");

/**
 * The copy of the shared `containerId` into `ownerId`'s collection under `parentId`, planned without writing:
 * new IDs for the folders, lists and albums added, what is reused, the fields mapped or created, and what the limits
 * say. The top of the copy gets `copyId`. A folder or list of `ownerId`'s own isn't a share to copy.
 */
export async function planShareCopy(
  store: CollectionStore,
  {
    ownerId,
    containerId,
    parentId,
    copyId,
  }: {
    ownerId: string;
    containerId: string;
    parentId: string | null;
    copyId: string;
  },
): Promise<ShareCopyPlan | Failure> {
  const top = await store.findContainer(containerId);
  if (!top || top.trashed || top.ownerId === ownerId) return unavailable();
  if (!(await store.canReadShared(ownerId, containerId))) return unavailable();
  const path = await destinationPath(parentId, ownerId, store);
  if (isFailure(path)) return path;

  // The folders and lists, top first, each under its copied parent.
  const source = await store.activeSubtree(containerId);
  const ids = new Map(source.map((each) => [each.id, each.id === containerId ? copyId : uuidv7()]));
  const containers = source.map((each) => ({
    ...each,
    id: ids.get(each.id) ?? each.id,
    parentId: each.id === containerId ? parentId : (ids.get(each.parentId ?? "") ?? null),
  }));
  const levels = Math.max(
    1,
    ...source.map((each) => {
      let level = 1;
      for (let at = each; at.id !== containerId; level += 1) {
        const parent = source.find((other) => other.id === at.parentId);
        if (!parent) break;
        at = parent;
      }
      return level;
    }),
  );

  // The albums in its lists, outside Trash, and which the person has already (TS-44).
  const lists = source.filter((each) => each.kind === "list").map((each) => each.id);
  const sourceEntries = await store.listEntries(lists);
  const read = await store.copyAlbums([...new Set(sourceEntries.map((entry) => entry.albumId))]);
  const known = await store.albumIdentities(ownerId);
  const byGroup = new Map<string, string>();
  const byLink = new Map<string, string>();
  for (const album of known) {
    if (album.releaseGroupId !== null) byGroup.set(album.releaseGroupId, album.id);
    for (const link of album.links) byLink.set(`${link.service}:${link.entityId}`, album.id);
  }
  const linksOf = Map.groupBy(read.links, (link) => link.albumId);
  const albums = new Map<string, AlbumPlan>();
  for (const album of read.albums) {
    const links = linksOf.get(album.id) ?? [];
    const found =
      (album.releaseGroupId === null ? undefined : byGroup.get(album.releaseGroupId)) ??
      links.map((link) => byLink.get(`${link.service}:${link.entityId}`)).find(Boolean);
    if (found !== undefined) {
      albums.set(album.id, { kind: "reused", id: found });
      continue;
    }
    const { releaseGroupId, ...fields } = album;
    const id = uuidv7();
    albums.set(album.id, { kind: "new", id, album: albumOf({ ...fields, id }), releaseGroupId });
    // Two of the owner's albums that are one release are one of the person's.
    if (releaseGroupId !== null) byGroup.set(releaseGroupId, id);
    for (const link of links) byLink.set(`${link.service}:${link.entityId}`, id);
  }
  const added = [...albums.entries()].filter(([, plan]) => plan.kind === "new");
  const links = added.flatMap(([sourceId, plan]) =>
    (linksOf.get(sourceId) ?? []).map(({ service, url, entityId }) => ({
      albumId: plan.id,
      service,
      url,
      entityId,
    })),
  );
  const entries = [
    ...new Map(
      sourceEntries.flatMap((entry) => {
        const album = albums.get(entry.albumId);
        const listId = ids.get(entry.listId);
        if (!album || listId === undefined) return [];
        const copied = { listId, albumId: album.id, addedAt: entry.addedAt };
        return [[membershipKey(listId, album.id), copied] as const];
      }),
    ).values(),
  ];

  // The values of the albums added, on the person's fields of the same name and type.
  const theirs = await store.fieldsOf(ownerId);
  const ownersFields = new Map(
    (await store.fieldsOf(top.ownerId)).map((field) => [field.id, field]),
  );
  const fields = new Map<string, FieldPlan>();
  const skipped = new Set<string>();
  const values: FieldValue[] = [];
  for (const [sourceId, plan] of added) {
    for (const value of read.values.filter((each) => each.albumId === sourceId)) {
      const owners = ownersFields.get(value.fieldId);
      if (!owners) continue;
      let mapped = fields.get(owners.id);
      if (!mapped) {
        const same = theirs.find((field) => nameKey(field.name) === nameKey(owners.name));
        if (same && same.type !== owners.type) {
          skipped.add(same.name);
          continue;
        }
        mapped = same
          ? { field: same, created: false, added: [], options: new Map() }
          : {
              field: { id: uuidv7(), name: owners.name, type: owners.type, options: [] },
              created: true,
              added: [],
              options: new Map(),
            };
        fields.set(owners.id, mapped);
      }
      values.push({
        albumId: plan.id,
        fieldId: mapped.field.id,
        value: mapValue(value.value, owners, mapped),
      });
    }
  }

  // Their own arrangement and view choices of the share's views, on the copies.
  const positions: Position[] = [];
  const views: ViewPrefs[] = [];
  for (const each of source) {
    const viewKey = ids.get(each.id) ?? each.id;
    const items =
      each.kind === "folder"
        ? source.filter((child) => child.parentId === each.id).map((child) => child.id)
        : sourceEntries.filter((entry) => entry.listId === each.id).map((entry) => entry.albumId);
    // oxlint-disable-next-line no-await-in-loop -- one view at a time, in the command's transaction
    const keys = await store.findPositions(ownerId, each.id, items);
    for (const [itemId, key] of keys) {
      const copied = each.kind === "folder" ? ids.get(itemId) : albums.get(itemId)?.id;
      if (copied !== undefined) positions.push({ viewKey, itemId: copied, key });
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    const prefs = await store.findViewPrefs(ownerId, each.id);
    if (prefs) views.push({ ...prefs, viewKey });
  }

  // What it adds, against the limits (FR-15), Trash included as they count it.
  const folders = source.filter((each) => each.kind === "folder").length;
  const created = [...fields.values()].filter((each) => each.created).length;
  const problems: string[] = [];
  const over = (now: number, adding: number, limit: number, what: string) => {
    if (now + adding > limit) {
      problems.push(
        `It adds ${adding.toLocaleString("en")} ${what}; you have ${now.toLocaleString("en")} of ${limit.toLocaleString("en")}, so it's ${(now + adding - limit).toLocaleString("en")} too many.`,
      );
    }
  };
  over(await store.countAlbums(ownerId), added.length, maxAlbums, "albums");
  over(await store.countContainers(ownerId), containers.length, maxContainers, "folders and lists");
  over(await store.countMemberships(ownerId), entries.length, maxMemberships, "list entries");
  over(theirs.length, created, maxFields, "custom fields");
  for (const { field, added: options } of fields.values()) {
    if (field.options.length + options.length > maxFieldOptions) {
      problems.push(
        `'${field.name}' would have ${field.options.length + options.length} options, more than ${maxFieldOptions}.`,
      );
    }
  }
  if (exceedsMaxDepth(path.length, levels)) {
    problems.push(`Folders and lists can be nested up to ${maxContainerDepth} levels deep.`);
  }

  return {
    preview: {
      folders,
      lists: lists.length,
      albums: added.length,
      reused: albums.size - added.length,
      fields: created,
      skippedFields: [...skipped].toSorted(),
      problems,
    },
    containers,
    albums,
    links,
    entries,
    fields,
    values,
    positions,
    views,
  };
}

/** The owner's value on the person's field: an option by its label, which the field gets if it lacks it. */
function mapValue(value: FieldValueData, owners: CustomField, mapped: FieldPlan): FieldValueData {
  const option = (id: string) => {
    const known = mapped.options.get(id);
    if (known !== undefined) return known;
    const label = owners.options.find((each) => each.id === id)?.label ?? id;
    const theirs = [...mapped.field.options, ...mapped.added].find(
      (each) => nameKey(each.label) === nameKey(label),
    );
    const target = theirs ?? { id: uuidv7(), label };
    if (!theirs) mapped.added.push(target);
    mapped.options.set(id, target.id);
    return target.id;
  };
  if (owners.type === "single_choice" && typeof value === "string") return option(value);
  if (owners.type === "multiple_choice" && Array.isArray(value)) return value.map(option);
  return value;
}

/**
 * `share.copy` (FR-07.22): copies a shared folder or list into the person's collection, as planned, or nothing when
 * the name is taken where it goes or it doesn't fit. Sent again with the same `copyId`, it copies nothing more.
 */
export async function copyShare(
  args: ShareCopyArgs,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = actingOwner(context, "collection", "You can't copy into this collection.");
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  const existing = await store.findContainer(args.copyId);
  if (existing) {
    return existing.ownerId === ownerId
      ? applied()
      : failure("validation_failed", "This ID is already in use.", [
          { path: "args.copyId", message: "Already in use" },
        ]);
  }
  const name = args.name.trim();
  const problem = containerNameProblem(name);
  if (problem) return problem;

  const plan = await planShareCopy(store, { ...args, ownerId });
  if (isFailure(plan)) return plan;
  if (plan.preview.problems.length > 0) {
    return failure("limit_exceeded", `Nothing was copied. ${plan.preview.problems.join(" ")}`);
  }
  const taken = findNameConflict(name, await store.activeChildren(ownerId, args.parentId));
  if (taken) {
    const parent = args.parentId === null ? undefined : await store.findContainer(args.parentId);
    return nameTakenProblem(taken.name, parent?.name ?? null);
  }

  const changes: ChangeInput[] = [];
  for (const each of plan.containers) {
    const container = each.id === args.copyId ? { ...each, name } : each;
    // oxlint-disable-next-line no-await-in-loop -- parents before children, in the command's transaction
    await store.insertContainer({ ...container, ownerId });
    changes.push({ entity: "container", id: container.id, op: "insert", data: container });
  }
  for (const album of plan.albums.values()) {
    if (album.kind !== "new") continue;
    // oxlint-disable-next-line no-await-in-loop -- one album at a time, as above
    await store.insertAlbum(
      { ...album.album, ownerId },
      { releaseGroupId: album.releaseGroupId, provenance: [] },
    );
    changes.push({ entity: "album", id: album.id, op: "insert", data: album.album });
  }
  for (const { albumId, ...link } of plan.links) {
    // oxlint-disable-next-line no-await-in-loop -- as above
    await store.insertServiceLink(albumId, ownerId, link);
    changes.push({
      entity: "link",
      id: serviceLinkKey(albumId, link.service),
      op: "insert",
      data: { albumId, service: link.service, url: link.url },
    });
  }
  for (const { field, created, added } of plan.fields.values()) {
    const options = [...field.options, ...added];
    if (created) {
      const keys = generateNKeysBetween(null, null, options.length);
      // oxlint-disable-next-line no-await-in-loop -- one field at a time, as above
      await store.insertField(
        { ...field, options, ownerId },
        options.map((option, index) => ({
          ...option,
          sortKey: keys[index] ?? generateKeyBetween(null, null),
        })),
      );
      changes.push({ entity: "field", id: field.id, op: "insert", data: { ...field, options } });
    } else if (added.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      let last = await store.lastOptionKey(field.id);
      for (const option of added) {
        last = generateKeyBetween(last, null);
        // oxlint-disable-next-line no-await-in-loop -- one option after another, each after the last
        await store.insertFieldOption(field.id, { ...option, sortKey: last });
      }
      changes.push({ entity: "field", id: field.id, op: "update", data: { ...field, options } });
    }
  }
  const fieldsById = new Map(
    [...plan.fields.values()].map(({ field, added }) => [
      field.id,
      { ...field, options: [...field.options, ...added] },
    ]),
  );
  for (const value of plan.values) {
    const field = fieldsById.get(value.fieldId);
    if (!field) continue;
    // oxlint-disable-next-line no-await-in-loop -- as above
    await store.applyField(value.albumId, value.fieldId);
    // oxlint-disable-next-line no-await-in-loop -- as above
    if (value.value !== null) await store.setFieldValue(value.albumId, field, value.value);
    changes.push({
      entity: "fieldValue",
      id: fieldValueKey(value.albumId, value.fieldId),
      op: "insert",
      data: value,
    });
  }
  for (const entry of plan.entries) {
    // oxlint-disable-next-line no-await-in-loop -- as above
    await store.insertMembership({ ...entry, ownerId });
    changes.push({
      entity: "membership",
      id: membershipKey(entry.listId, entry.albumId),
      op: "insert",
      data: entry,
    });
  }
  for (const position of plan.positions) {
    // oxlint-disable-next-line no-await-in-loop -- as above
    await store.savePosition(ownerId, position);
    changes.push({
      entity: "position",
      id: positionKey(position.viewKey, position.itemId),
      op: "insert",
      data: position,
    });
  }
  for (const prefs of plan.views) {
    // oxlint-disable-next-line no-await-in-loop -- as above
    await store.saveViewPrefs(ownerId, prefs);
    changes.push({ entity: "view", id: prefs.viewKey, op: "insert", data: prefs });
  }
  return {
    status: "applied",
    changes,
    result: {
      containerId: args.copyId,
      albums: plan.preview.albums,
      reused: plan.preview.reused,
    },
  };
}

/** The preview's sentence of what a copy adds (DS-70): "3 folders, 12 lists and 340 albums, 120 of them yours already". */
export function copySummary(preview: ShareCopyPreview): string {
  const parts = [
    preview.folders > 0 && count(preview.folders, "folder", "folders"),
    preview.lists > 0 && count(preview.lists, "list", "lists"),
    count(preview.albums + preview.reused, "album", "albums"),
  ].filter((part): part is string => typeof part === "string");
  const listed =
    parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return preview.reused > 0
    ? `${listed}, ${preview.reused.toLocaleString("en")} of them already yours`
    : listed;
}
