// The read tools (TS-63), offered to both modes: the overview, pages of folders, lists, Unsorted and Trash, one album
// in full, search, the custom fields, Shared with me, and the outcome of an earlier write or approval request. They
// read what the person may read in the app (FR-10.2, X-02): their whole collection, and what others share with them
// (FR-07). Results are structured data; collection text is the user's, never instructions (TS-65, Q-05).

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  albumDetail,
  albumSources,
  collectionOverview,
  collectionTree,
  collectionUsage,
  containerPage,
  fieldsWithUsage,
  findApproval,
  findMutationResult,
  mutationRunning,
  searchCollection,
  sharedWithMe,
  trashContents,
  unsortedPage,
  type Database,
  type SourcedAlbum,
} from "@tonaris/db";
import {
  approvalState,
  approvalSummary,
  containerKinds,
  fieldTypes,
  maxAlbums,
  maxContainers,
  maxFields,
  maxMemberships,
  outcomeSchema,
  releaseTypes,
  streamingServices,
  trashUnitKinds,
  type McpPrincipal,
  type SearchAlbum,
} from "@tonaris/domain";

import {
  agentAlbum,
  agentValue,
  badCursor,
  cursorInput,
  failed,
  nextCursor,
  offsetOf,
  pageOutput,
  pageSize,
  result,
  summaryKeys,
  userData,
} from "./results";

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

/** How many folders and lists the overview's tree shows at most; `list_container` pages through the rest. */
export const overviewTreeLimit = 500;

const year = z.number().int();

const albumSummarySchema = z.object({
  id: z.uuid(),
  title: agentValue(z.string()),
  artistCredit: agentValue(z.string()).describe("The artist as credited."),
  originalYear: agentValue(year.nullable()).describe("The original release year, when known."),
  releaseType: agentValue(z.enum(releaseTypes).nullable()).describe(
    "Album, EP, single, compilation and so on; null when unclassified.",
  ),
});

const containerSchema = z.object({
  id: z.uuid(),
  kind: z.enum(containerKinds),
  name: z.string(),
  parentId: z.uuid().nullable().describe("The folder it is in; null at the top level."),
});

const locationSchema = z
  .array(z.string())
  .describe("The names from the top of the collection down to the folder or list.");

const sharedBy = z
  .string()
  .nullable()
  .describe(
    "Who shares it with the user, for someone else's content; null for the user's own. Their display name, or 'a Tonaris member' without one.",
  );

const searchContainer = containerSchema.extend({ location: locationSchema });
type SearchContainer = z.infer<typeof searchContainer>;
const group = <T extends z.ZodType>(item: T) =>
  z.object({ total: z.number(), items: z.array(item) });

/** A folder or list as search shows it, without what the app's search adds for its own use. */
const located = ({ id, kind, name, parentId, location }: SearchContainer): SearchContainer => ({
  id,
  kind,
  name,
  parentId,
  location,
});

const summary = (album: SourcedAlbum) => agentAlbum(album, summaryKeys);
const ownerName = (owner: { displayName: string | null } | null) =>
  owner ? (owner.displayName ?? "a Tonaris member") : null;

const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type ReadToolsContext = { db: Database; principal: McpPrincipal };

export function registerReadTools(server: McpServer, { db, principal }: ReadToolsContext): void {
  const { userId } = principal;

  server.registerTool(
    "get_overview",
    {
      title: "Collection overview",
      description: `Counts of the user's albums, Unsorted albums, folders, lists and Trash; how much of each limit the collection uses (Trash included); the tree of folders and lists, breadth-first, up to ${overviewTreeLimit}; and what this connection may do. Call it first to plan without listing every album. ${userData}`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        albums: z.number().describe("Albums outside Trash."),
        unsorted: z.number().describe("Albums in no list."),
        folders: z.number(),
        lists: z.number(),
        trashUnits: z.number().describe("Deletions waiting in Trash, each recoverable as a whole."),
        usage: z
          .object({
            albums: z.object({ used: z.number(), limit: z.number() }),
            foldersAndLists: z.object({ used: z.number(), limit: z.number() }),
            listEntries: z.object({ used: z.number(), limit: z.number() }),
            fields: z.object({ used: z.number(), limit: z.number() }),
          })
          .describe("Each limit and how much of it is used, Trash included."),
        tree: z.object({
          items: z.array(containerSchema),
          total: z.number().describe("Folders and lists outside Trash in all."),
          complete: z.boolean().describe("False when the tree was cut off: use list_container."),
        }),
        connection: z.object({
          mode: z
            .enum(["read_only", "manage"])
            .describe("What this connection may do: read only, or also manage the collection."),
        }),
      }),
      annotations: readOnly,
    },
    async () => {
      const [overview, usage, tree] = await Promise.all([
        collectionOverview(db, userId),
        collectionUsage(db, userId),
        collectionTree(db, userId, overviewTreeLimit),
      ]);
      return result(
        `${countOf(overview.albums, "album")} (${overview.unsorted} unsorted) in ${countOf(overview.lists, "list")} and ${countOf(overview.folders, "folder")}; ${countOf(overview.trashUnits, "item")} in Trash.`,
        {
          ...overview,
          usage: {
            albums: { used: usage.albums, limit: maxAlbums },
            foldersAndLists: { used: usage.containers, limit: maxContainers },
            listEntries: { used: usage.memberships, limit: maxMemberships },
            fields: { used: usage.fields, limit: maxFields },
          },
          tree: { ...tree, complete: tree.items.length === tree.total },
          connection: { mode: principal.mode },
        },
      );
    },
  );

  server.registerTool(
    "list_container",
    {
      title: "List a folder or list",
      description: `A page of the folders and lists at the top of the collection or in a folder, or of the albums in a list, ${pageSize} at a time, in the user's manual order (then folders and lists as created, albums as added). Leave containerId out for the top level. It also lists a folder or list someone shares with the user. ${userData}`,
      inputSchema: z.object({
        containerId: z.uuid().optional().describe("A folder or list; the top level if left out."),
        cursor: cursorInput,
      }),
      outputSchema: z.object({
        container: containerSchema
          .extend({ description: z.string().nullable() })
          .nullable()
          .describe("The folder or list; null for the top level."),
        sharedBy,
        children: z
          .array(containerSchema)
          .optional()
          .describe("For the top level or a folder: its folders and lists."),
        albums: z.array(albumSummarySchema).optional().describe("For a list: its albums."),
        ...pageOutput,
      }),
      annotations: readOnly,
    },
    async ({ containerId, cursor }) => {
      const offset = offsetOf(cursor);
      if (offset === undefined) return badCursor();
      const listing = await containerPage(db, {
        readerId: userId,
        containerId,
        offset,
        limit: pageSize,
      });
      if (listing.kind === "missing") {
        return failed("not_found", "There is no such folder or list, or it is in Trash.");
      }
      const { total, items } = listing.page;
      const common = {
        container: listing.container,
        sharedBy: ownerName(listing.owner),
        total,
        nextCursor: nextCursor(offset, items.length, total),
      };
      const shown = items.length < total ? `, ${items.length} shown` : "";
      if (listing.kind === "albums") {
        return result(`${countOf(total, "album")} in the list${shown}.`, {
          ...common,
          albums: listing.page.items.map(summary),
        });
      }
      return result(`${countOf(total, "folder or list", "folders and lists")}${shown}.`, {
        ...common,
        children: listing.page.items,
      });
    },
  );

  server.registerTool(
    "get_album",
    {
      title: "Get an album",
      description: `One album in full: its information, streaming links, custom-field values, the lists it is in, and whether it is in Trash. It also reads an album someone shares with the user. ${userData}`,
      inputSchema: z.object({ albumId: z.uuid() }),
      outputSchema: albumSummarySchema.extend({
        isLive: agentValue(z.boolean().nullable()),
        recordingYearStart: agentValue(year.nullable()).describe("For a live album."),
        recordingYearEnd: agentValue(year.nullable()),
        artworkUrl: agentValue(z.string().nullable()),
        inTrash: z.boolean(),
        sharedBy,
        lists: z
          .array(z.object({ id: z.uuid(), name: z.string(), location: locationSchema }))
          .describe("The lists it is in; none means Unsorted."),
        links: z.array(z.object({ service: z.enum(streamingServices), url: z.string() })),
        fields: z.array(
          z.object({
            fieldId: z.uuid(),
            name: z.string(),
            type: z.enum(fieldTypes),
            value: z
              .union([z.string(), z.boolean(), z.array(z.string())])
              .nullable()
              .describe(
                "Null when the field is applied but empty. A choice field's value is its option ID or IDs.",
              ),
            chosen: z
              .array(z.object({ id: z.uuid(), label: z.string() }))
              .describe("A choice field's chosen options."),
          }),
        ),
      }),
      annotations: readOnly,
    },
    async ({ albumId }) => {
      const detail = await albumDetail(db, { readerId: userId, albumId });
      if (!detail) return failed("not_found", "There is no such album.");
      const album = agentAlbum(detail.album, [
        ...summaryKeys,
        "isLive",
        "recordingYearStart",
        "recordingYearEnd",
        "artworkUrl",
      ]);
      const where = detail.inTrash
        ? "in Trash"
        : detail.lists.length === 0
          ? "in Unsorted"
          : `in ${countOf(detail.lists.length, "list")}`;
      return result(`The album is ${where}.`, {
        ...album,
        inTrash: detail.inTrash,
        sharedBy: ownerName(detail.owner),
        lists: detail.lists,
        links: detail.links,
        fields: detail.fields,
      });
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search the collection",
      description: `Finds the user's folders and lists by name, and albums by title or artist, ignoring case and accents, best first, as the app's search does; then the same in what others share with the user. Each group gives its total and at most limit matches. ${userData}`,
      inputSchema: z.object({
        query: z.string().trim().min(1).max(200).describe("Text to find."),
        limit: z.number().int().min(1).max(50).default(20).describe("At most this many per group."),
      }),
      outputSchema: z.object({
        folders: group(searchContainer),
        lists: group(searchContainer),
        albums: group(
          albumSummarySchema.extend({
            lists: z.array(z.object({ id: z.uuid(), location: locationSchema })),
          }),
        ),
        shared: z.object({
          folders: group(searchContainer.extend({ sharedBy })),
          lists: group(searchContainer.extend({ sharedBy })),
          albums: group(
            albumSummarySchema.extend({
              sharedBy,
              lists: z.array(z.object({ id: z.uuid(), location: locationSchema })),
            }),
          ),
        }),
      }),
      annotations: readOnly,
    },
    async ({ query, limit }) => {
      const found = await searchCollection(db, { ownerId: userId, query, limit });
      const sources = await albumSources(db, [
        ...found.albums.items.map((album) => album.id),
        ...found.shared.albums.items.map((album) => album.id),
      ]);
      const sourced = (album: SearchAlbum) => ({
        ...agentAlbum(
          { ...album, artworkUrl: null, sources: sources.get(album.id) ?? {} },
          summaryKeys,
        ),
        lists: album.lists.map(({ id, location }) => ({ id, location })),
      });
      const ofShared = (item: SearchContainer & { owner: { displayName: string | null } }) =>
        Object.assign(located(item), { sharedBy: ownerName(item.owner) });
      const matches =
        found.folders.total +
        found.lists.total +
        found.albums.total +
        found.shared.folders.total +
        found.shared.lists.total +
        found.shared.albums.total;
      return result(`${matches === 0 ? "No" : matches} matches.`, {
        folders: { total: found.folders.total, items: found.folders.items.map(located) },
        lists: { total: found.lists.total, items: found.lists.items.map(located) },
        albums: { total: found.albums.total, items: found.albums.items.map(sourced) },
        shared: {
          folders: {
            total: found.shared.folders.total,
            items: found.shared.folders.items.map(ofShared),
          },
          lists: { total: found.shared.lists.total, items: found.shared.lists.items.map(ofShared) },
          albums: {
            total: found.shared.albums.total,
            items: found.shared.albums.items.map((album) =>
              Object.assign(sourced(album), { sharedBy: ownerName(album.owner) }),
            ),
          },
        },
      });
    },
  );

  server.registerTool(
    "list_unsorted",
    {
      title: "List Unsorted",
      description: `A page of the user's Unsorted albums, those in no list, ${pageSize} at a time, in their manual order, then newest first. ${userData}`,
      inputSchema: z.object({ cursor: cursorInput }),
      outputSchema: z.object({ albums: z.array(albumSummarySchema), ...pageOutput }),
      annotations: readOnly,
    },
    async ({ cursor }) => {
      const offset = offsetOf(cursor);
      if (offset === undefined) return badCursor();
      const page = await unsortedPage(db, { ownerId: userId, offset, limit: pageSize });
      return result(`${countOf(page.total, "album")} in Unsorted.`, {
        albums: page.items.map(summary),
        total: page.total,
        nextCursor: nextCursor(offset, page.items.length, page.total),
      });
    },
  );

  server.registerTool(
    "list_trash",
    {
      title: "List Trash",
      description: `A page of what the user deleted to Trash, oldest first, ${pageSize} at a time. Each unit is a folder with what was inside it, a list, or an album, recovered as a whole until it expires; then it is removed for good. ${userData}`,
      inputSchema: z.object({ cursor: cursorInput }),
      outputSchema: z.object({
        units: z.array(
          z.object({
            unitId: z.uuid(),
            kind: z.enum(trashUnitKinds),
            rootId: z.uuid().describe("The folder, list or album deleted."),
            name: z.string().describe("Its name, or the album's title."),
            artistCredit: z.string().nullable().describe("An album's artist; null otherwise."),
            parentId: z
              .uuid()
              .nullable()
              .describe("The folder it was in, where recovery returns it; null at the top level."),
            folders: z.number().describe("Folders deleted with it."),
            lists: z.number().describe("Lists deleted with it."),
            deletedAt: z.iso.datetime(),
            expiresAt: z.iso.datetime(),
          }),
        ),
        ...pageOutput,
      }),
      annotations: readOnly,
    },
    async ({ cursor }) => {
      const offset = offsetOf(cursor);
      if (offset === undefined) return badCursor();
      const units = await trashContents(db, userId);
      const page = units.slice(offset, offset + pageSize);
      return result(`${countOf(units.length, "item")} in Trash.`, {
        units: page.map((unit) => ({
          unitId: unit.id,
          kind: unit.kind,
          rootId: unit.rootId,
          name: unit.name,
          artistCredit: unit.artist,
          parentId: unit.parentId,
          folders: unit.folders,
          lists: unit.lists,
          deletedAt: unit.deletedAt,
          expiresAt: unit.expiresAt,
        })),
        total: units.length,
        nextCursor: nextCursor(offset, page.length, units.length),
      });
    },
  );

  server.registerTool(
    "list_fields",
    {
      title: "List custom fields",
      description: `The user's custom fields, as created: each with its type, its options for a choice field, and how many albums apply it, in Trash included. ${userData}`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        fields: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            type: z.enum(fieldTypes),
            options: z.array(z.object({ id: z.uuid(), label: z.string() })),
            albums: z.number().describe("Albums outside Trash applying it."),
            inTrash: z.number().describe("Albums in Trash applying it."),
          }),
        ),
        limit: z.number().describe("How many fields the user may have."),
      }),
      annotations: readOnly,
    },
    async () => {
      const fields = await fieldsWithUsage(db, userId);
      return result(`${countOf(fields.length, "custom field")}.`, { fields, limit: maxFields });
    },
  );

  server.registerTool(
    "list_shared_with_me",
    {
      title: "List Shared with me",
      description: `The folders and lists others share with the user and they keep in Shared with me: whose each is, whether an invitation or a link shares it, and whether it can be opened now. Read one with list_container. ${userData}`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        entries: z.array(
          z.object({
            containerId: z.uuid(),
            kind: z.enum(containerKinds).nullable().describe("Null once it isn't available."),
            name: z.string().nullable().describe("Null once it isn't available."),
            sharedBy: z.string(),
            via: z.object({ invitation: z.boolean(), link: z.boolean() }),
            available: z.boolean().describe("Whether it can be opened now."),
          }),
        ),
      }),
      annotations: readOnly,
    },
    async () => {
      const entries = await sharedWithMe(db, userId);
      return result(`${countOf(entries.length, "folder or list", "folders and lists")} shared.`, {
        entries: entries.map((entry) => ({
          containerId: entry.containerId,
          kind: entry.kind,
          name: entry.name,
          sharedBy: entry.owner.displayName ?? "a Tonaris member",
          via: entry.via,
          available: entry.available,
        })),
      });
    },
  );

  server.registerTool(
    "get_operation",
    {
      title: "Check a change",
      description:
        "The outcome of a change made earlier with this idempotencyKey: confirmed, failed with why, a conflict, a choice it needs, or pending while it still runs. Use it when a write's answer was lost, before trying again.",
      inputSchema: z.object({
        idempotencyKey: z.uuid().describe("The idempotencyKey the write was sent with."),
      }),
      outputSchema: z.object({
        idempotencyKey: z.uuid(),
        outcome: z.union([outcomeSchema, z.object({ status: z.literal("pending") })]),
      }),
      annotations: readOnly,
    },
    async ({ idempotencyKey }) => {
      const found = await findMutationResult(db, userId, idempotencyKey);
      if (found) {
        return result(`The change is ${found.outcome.status}.`, {
          idempotencyKey,
          outcome: found.outcome,
        });
      }
      if (await mutationRunning(db, userId, idempotencyKey)) {
        return result("The change is still running. Check again in a moment.", {
          idempotencyKey,
          outcome: { status: "pending" as const },
        });
      }
      return failed(
        "not_found",
        "No change was received with this key in the last 30 days, so nothing was applied. It is safe to make it.",
      );
    },
  );

  server.registerTool(
    "get_approval",
    {
      title: "Check an approval",
      description:
        "Whether the owner has approved, declined or not yet answered a request this connection made, and whether it expired or was used.",
      inputSchema: z.object({ approvalId: z.uuid() }),
      annotations: readOnly,
    },
    async ({ approvalId }) => {
      const approval = await findApproval(db, approvalId);
      if (!approval || approval.grantId !== principal.grantId) {
        return failed("not_found", "There is no approval with this ID for this connection.");
      }
      const state = approvalState(approval);
      return result(`${approvalSummary(approval.scope)}: ${state}.`, {
        approvalId,
        state,
        summary: approvalSummary(approval.scope),
        expiresAt: approval.expiresAt.toISOString(),
      });
    },
  );
}
