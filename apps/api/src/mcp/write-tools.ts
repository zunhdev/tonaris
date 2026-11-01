// The write tools for ordinary operations (TS-63, FR-10.4), recovery from Trash among them (FR-10.7), offered to
// Manage collection connections only (TS-62).
// Each is a thin wrapper over the app's own commands: it plans their mutation envelopes, and `Writer` runs them as a
// batch under the tool's `idempotencyKey` (TS-22, TS-25). Outcomes use TS-27's vocabulary, item by item: confirmed,
// failed with why, a conflict with the current values, a choice the command needs, or skipped after a failed step.
// A change the agent doesn't base on values it read is based on the values saved now (TS-21). Batch size alone never
// asks for approval (FR-10.4); the gated operations are TON-83's, and app-only operations have no tool (X-03).

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  albumBase,
  containerBase,
  fieldValueBase,
  findFieldIn,
  linkBase,
  sharingImpact,
  viewPrefsBase,
  viewSequence,
  type Database,
  type ImpactQuery,
} from "@tonaris/db";
import {
  albumFields,
  containerKinds,
  fieldTypes,
  maxBatchItems,
  maxDescriptionLength,
  maxFieldOptions,
  maxLinkLength,
  maxNameLength,
  maxOrderItems,
  planMoves,
  releaseTypes,
  shareTokenSchema,
  sortDirections,
  sortModes,
  streamingServices,
  viewLayouts,
  type AlbumFields,
  type Audience,
  type McpPrincipal,
  viewPrefsFields,
} from "@tonaris/domain";

import {
  answerWritten,
  failed,
  idempotencyKeyInput,
  idsInput as ids,
  keyReused,
  maxIdempotencyKeyLength,
  tooMany,
  uuidInput as uuid,
} from "./results";
import type { McpWriter, PlanIds, PlannedItem } from "./writes";

const writes = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const idempotencyKey = idempotencyKeyInput
  .optional()
  .describe(
    `Any unique text, up to ${maxIdempotencyKeyLength} characters, made once for this change. Send the same key with the same arguments to retry safely: nothing already done is done twice. Without one, the result names the key it used.`,
  );

const year = z.number().int();

/**
 * Changes in one call of a tool that plans two envelopes for each, such as a join and then a leave: as many as fit in
 * one batch (TS-25).
 */
const maxPairedChanges = maxBatchItems / 2;

/** As limits are written in tool descriptions: 2,000. */
const count = (limit: number) => limit.toLocaleString("en");

const viewInput = z
  .union([z.enum(["root", "unsorted"]), uuid])
  .describe("`root` for the top level, `unsorted`, or a folder's or list's ID.");

const albumValues = z.object({
  title: z.string().optional(),
  artistCredit: z.string().optional().describe("The artist as credited."),
  releaseType: z.enum(releaseTypes).nullable().optional().describe("Null for unclassified."),
  isLive: z.boolean().nullable().optional(),
  originalYear: year.nullable().optional(),
  recordingYearStart: year.nullable().optional().describe("For a live album."),
  recordingYearEnd: year.nullable().optional(),
});

const outcomeOutput = z
  .looseObject({
    status: z
      .enum(["confirmed", "failed", "conflict", "needs_input", "needs_approval", "skipped"])
      .describe(
        "confirmed: saved. failed: nothing changed; code and message say why. conflict: it changed since the values the change was based on; conflicts give the current ones. needs_input: a choice to make (need, candidates); send the change again with it. skipped: not run, because the step it needed didn't succeed.",
      ),
  })
  .describe("The outcome, in Tonaris's vocabulary.");

const output = (target: z.ZodRawShape) =>
  z.object({
    idempotencyKey: z.string().describe("The key this change ran under."),
    items: z.array(z.object({ ...target, outcome: outcomeOutput })),
  });

/** A planned change: its envelopes, and what each is about for the agent; steps without a target aren't reported. */
type Plan = { items: PlannedItem[]; targets: (Record<string, unknown> | undefined)[] };

/** One target per envelope. */
const each = (items: PlannedItem[], targets: Record<string, unknown>[]): Plan => ({
  items,
  targets,
});

/** Every album in every list, as membership pairs. */
const pairsOf = (albumIds: readonly string[], listIds: readonly string[]) =>
  listIds.flatMap((listId) => albumIds.map((albumId) => ({ listId, albumId })));

/**
 * The share link's token in `url` (TS-32): `url` itself, or what precedes its first `/`, `?` or `#`, if that is a
 * bare token; otherwise the first path segment after an `/s/` that is one.
 */
export function shareTokenOf(url: string): string | undefined {
  const trimmed = url.trim();
  const candidates = [trimmed.split(/[/?#]/, 1)[0], ...(trimmed.match(/(?<=\/s\/)[^/?#]*/g) ?? [])];
  return candidates.find((candidate) => shareTokenSchema.safeParse(candidate).success);
}

/** Someone who sees content, as an agent reads it: a person by name, or anyone with a link, and through what. */
const agentAudience = (audience: Audience) =>
  audience.kind === "person"
    ? { kind: "person", name: audience.name, invited: audience.pending, via: audience.via.name }
    : { kind: "link", via: audience.via.name };

/**
 * What a move or a recovery does to sharing (FR-07.14), as the app previews it: who newly sees it, who no longer sees
 * it through the folders it leaves, and the shares it keeps. Undefined when there is nothing to say.
 */
async function sharingEffects(db: Database, ownerId: string, query: ImpactQuery) {
  const impact = await sharingImpact(db, ownerId, query);
  if (typeof impact === "string") return undefined;
  const effects = {
    newlySeenBy: impact.added.map(agentAudience),
    noLongerSeenBy: impact.removed.map(agentAudience),
    stillSharedWith: impact.direct.map(agentAudience),
  };
  return Object.values(effects).some((list) => list.length > 0) ? effects : undefined;
}

export type WriteToolsContext = { db: Database; principal: McpPrincipal; writer: McpWriter };

export function registerWriteTools(
  server: McpServer,
  { db, principal, writer }: WriteToolsContext,
): void {
  const { userId } = principal;
  const write = writer.write;

  /** Runs the plan under the tool's key, and answers with each target and its outcome. */
  async function run(
    tool: string,
    args: Record<string, unknown> & { idempotencyKey?: string | undefined },
    plan: (ids: PlanIds) => Plan,
  ) {
    let targets: Plan["targets"] = [];
    const written = await write(principal, {
      tool,
      args,
      idempotencyKey: args.idempotencyKey,
      plan: (planIds) => {
        const planned = plan(planIds);
        targets = planned.targets;
        return planned.items;
      },
    });
    if (written.status === "key_reused") return keyReused();
    return answerWritten(written, targets);
  }

  // Organizing (FR-01, FR-10.4).

  server.registerTool(
    "create_container",
    {
      title: "Create a folder or list",
      description:
        "Creates a folder or a list at the top level or in a folder, optionally with a description. A name must be unique among its neighbours, ignoring case.",
      inputSchema: z.object({
        kind: z.enum(containerKinds),
        name: z.string().describe(`At most ${maxNameLength} characters.`),
        parentId: uuid
          .nullable()
          .optional()
          .describe("The folder to put it in; the top level if left out."),
        description: z
          .string()
          .optional()
          .describe(`Plain text, at most ${count(maxDescriptionLength)} characters.`),
        idempotencyKey,
      }),
      outputSchema: output({ containerId: uuid, name: z.string() }),
      annotations: writes,
    },
    async (args) =>
      run("create_container", args, ({ record }) => {
        const id = record("container");
        const target = { containerId: id, name: args.name };
        const create: PlannedItem = {
          name: "container.create",
          args: { id, kind: args.kind, parentId: args.parentId ?? null, name: args.name },
        };
        if (args.description === undefined) return each([create], [target]);
        return {
          items: [
            create,
            {
              name: "container.describe",
              args: { id, description: args.description },
              base: { description: null },
              after: [0],
            },
          ],
          targets: [target, { containerId: id, name: args.name, step: "description" }],
        };
      }),
  );

  const containerChange = z.object({ containerId: uuid, idempotencyKey });

  server.registerTool(
    "rename_container",
    {
      title: "Rename a folder or list",
      description:
        "Renames a folder or list. Pass base, the name you read, to be told if it changed since; otherwise the name saved now is replaced.",
      inputSchema: containerChange.extend({
        name: z.string(),
        base: z.object({ name: z.string() }).optional(),
      }),
      outputSchema: output({ containerId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const current = await containerBase(db, { ownerId: userId, containerId: args.containerId });
      const base = args.base ?? { name: current?.name ?? "" };
      return run("rename_container", args, () =>
        each(
          [{ name: "container.rename", args: { id: args.containerId, name: args.name }, base }],
          [{ containerId: args.containerId }],
        ),
      );
    },
  );

  server.registerTool(
    "set_description",
    {
      title: "Describe a folder or list",
      description: `Sets a folder's or list's plain-text description, at most ${count(maxDescriptionLength)} characters, or clears it with null. Pass base, the description you read, to be told if it changed since.`,
      inputSchema: containerChange.extend({
        description: z.string().nullable(),
        base: z.object({ description: z.string().nullable() }).optional(),
      }),
      outputSchema: output({ containerId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const current = await containerBase(db, { ownerId: userId, containerId: args.containerId });
      const base = args.base ?? { description: current?.description ?? null };
      return run("set_description", args, () =>
        each(
          [
            {
              name: "container.describe",
              args: { id: args.containerId, description: args.description },
              base,
            },
          ],
          [{ containerId: args.containerId }],
        ),
      );
    },
  );

  server.registerTool(
    "move_items",
    {
      title: "Move folders and lists",
      description:
        "Moves folders and lists into a folder, or to the top level with parentId null, with everything inside them. Each moves on its own: one that can't, such as a folder into itself or a name already there, fails alone. Each reports its sharing effects: who newly sees it, who no longer does through the folders it leaves, and the shares it keeps.",
      inputSchema: z.object({
        containerIds: ids(maxBatchItems),
        parentId: uuid.nullable().describe("The folder to move them into; null for the top level."),
        idempotencyKey,
      }),
      outputSchema: output({ containerId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const [bases, effects] = await Promise.all([
        Promise.all(
          args.containerIds.map((containerId) =>
            containerBase(db, { ownerId: userId, containerId }),
          ),
        ),
        // As the app shows them before a move (FR-07.14), reported with each outcome.
        Promise.all(
          args.containerIds.map((id) =>
            sharingEffects(db, userId, { kind: "move", id, to: args.parentId }),
          ),
        ),
      ]);
      return run("move_items", args, () =>
        each(
          args.containerIds.map((id, index) => ({
            name: "container.move",
            args: { id, parentId: args.parentId },
            base: { parentId: bases[index]?.parentId ?? null },
          })),
          args.containerIds.map((containerId, index) => ({
            containerId,
            ...(effects[index] ? { sharing: effects[index] } : {}),
          })),
        ),
      );
    },
  );

  server.registerTool(
    "add_to_lists",
    {
      title: "Add albums to lists",
      description: `Puts each album in each list, at most ${maxBatchItems} pairs at a time. An album already in a list keeps its place there (result alreadyInList). Each pair is its own change, so one that fails doesn't stop the others.`,
      inputSchema: z.object({ albumIds: ids(maxBatchItems), listIds: ids(20), idempotencyKey }),
      outputSchema: output({ albumId: uuid, listId: uuid }),
      annotations: { ...writes, idempotentHint: true },
    },
    async (args) => {
      const pairs = pairsOf(args.albumIds, args.listIds);
      if (pairs.length > maxBatchItems) return tooMany(maxBatchItems);
      return run("add_to_lists", args, () =>
        each(
          pairs.map((pair) => ({ name: "membership.add", args: pair })),
          pairs,
        ),
      );
    },
  );

  server.registerTool(
    "remove_from_lists",
    {
      title: "Take albums out of lists",
      description: `Takes each album out of each list, at most ${maxBatchItems} pairs at a time. The albums stay in the collection, in Unsorted when they are in no list any more. Nothing is deleted.`,
      inputSchema: z.object({ albumIds: ids(maxBatchItems), listIds: ids(20), idempotencyKey }),
      outputSchema: output({ albumId: uuid, listId: uuid }),
      annotations: { ...writes, idempotentHint: true },
    },
    async (args) => {
      const pairs = pairsOf(args.albumIds, args.listIds);
      if (pairs.length > maxBatchItems) return tooMany(maxBatchItems);
      return run("remove_from_lists", args, () =>
        each(
          pairs.map((pair) => ({ name: "membership.remove", args: pair })),
          pairs,
        ),
      );
    },
  );

  server.registerTool(
    "move_albums",
    {
      title: "Move albums between lists",
      description:
        "Moves albums from one list to another: each joins the target list, then leaves the source list once it has. An album that can't join stays where it was.",
      inputSchema: z.object({
        // Each album joins, then leaves: two envelopes.
        albumIds: ids(maxPairedChanges),
        fromListId: uuid,
        toListId: uuid,
        idempotencyKey,
      }),
      outputSchema: output({ albumId: uuid }),
      annotations: writes,
    },
    async (args) =>
      run("move_albums", args, () => {
        const items: PlannedItem[] = [];
        const targets: Plan["targets"] = [];
        for (const albumId of args.albumIds) {
          items.push(
            { name: "membership.add", args: { listId: args.toListId, albumId } },
            {
              name: "membership.remove",
              args: { listId: args.fromListId, albumId },
              after: [items.length],
            },
          );
          // The move succeeded once the album left the source list.
          targets.push(undefined, { albumId });
        }
        return { items, targets };
      }),
  );

  server.registerTool(
    "set_order",
    {
      title: "Arrange a view by hand",
      description:
        "Places items in the user's manual order of a view, in the order given: at the top, at the bottom, or before or after another item. The items are folders and lists at the top level or in a folder, or albums in a list or in Unsorted. The order is the user's own and doesn't change what others see.",
      inputSchema: z.object({
        view: viewInput,
        itemIds: ids(maxBatchItems).describe("The items to place, in the order they should come."),
        place: z
          .union([z.enum(["top", "bottom"]), z.object({ before: uuid }), z.object({ after: uuid })])
          .describe("Where the items go: top, bottom, {before: itemId} or {after: itemId}."),
        idempotencyKey,
      }),
      outputSchema: output({ view: z.string() }),
      annotations: writes,
    },
    async (args) => {
      const sequence = await viewSequence(db, {
        personId: userId,
        viewKey: args.view,
        limit: maxOrderItems,
      });
      if (!sequence) return failed("not_found", "There is no such folder or list.");
      // Each item after the one before it, the first at the place: one move, written together (TS-16).
      const written = planMoves(sequence.ids, sequence.keys, args.itemIds, args.place);
      const base = Object.fromEntries(
        [...written.keys()].map((id) => [id, sequence.keys.get(id) ?? null]),
      );
      return run("set_order", args, () =>
        each(
          [
            {
              name: "order.set",
              args: { viewKey: args.view, keys: Object.fromEntries(written) },
              base,
            },
          ],
          [{ view: args.view }],
        ),
      );
    },
  );

  server.registerTool(
    "set_view_preferences",
    {
      title: "Set how a view shows",
      description:
        "Sets the user's choices for one view: its sort (mode and direction together), grouping by release type, and layout. Null forgets a choice, back to the account default. Folder views sort by name, created or manual; lists and Unsorted by year, name or manual.",
      inputSchema: z.object({
        view: viewInput,
        sortMode: z.enum(sortModes).nullable().optional(),
        sortDir: z.enum(sortDirections).nullable().optional(),
        grouped: z.boolean().nullable().optional(),
        layout: z.enum(viewLayouts).nullable().optional(),
        idempotencyKey,
      }),
      outputSchema: output({ view: z.string() }),
      annotations: writes,
    },
    async ({ view, idempotencyKey: key, ...choices }) => {
      const current = await viewPrefsBase(db, { personId: userId, viewKey: view });
      const changed = viewPrefsFields.filter((field) => choices[field] !== undefined);
      const chosen = Object.fromEntries(changed.map((field) => [field, choices[field]]));
      const base = Object.fromEntries(changed.map((field) => [field, current[field]]));
      return run("set_view_preferences", { view, idempotencyKey: key, ...choices }, () =>
        each([{ name: "view.set", args: { viewKey: view, ...chosen }, base }], [{ view }]),
      );
    },
  );

  // Albums (FR-02, FR-03, FR-10.4, FR-10.5).

  server.registerTool(
    "add_albums",
    {
      title: "Add albums",
      description:
        "Adds albums from links you found (Spotify, Apple Music, Qobuz, Tidal or YouTube Music album links) or from their details, optionally into a list; otherwise they go to Unsorted. Tonaris never looks for links itself. A link may come back needs_input: need details, when Tonaris can't tell the album (send the item again with details, with what the user knows), or need match, when it fits more than one album: the user confirms which one, through confirm_match. An album the user already has is reused, not added twice.",
      inputSchema: z.object({
        items: z
          .array(
            z.union([
              z.object({
                link: z.string().describe("A streaming service's link to the album."),
                details: albumValues
                  .required({ title: true, artistCredit: true })
                  .optional()
                  .describe("The album's details after need details."),
              }),
              albumValues
                .required({ title: true, artistCredit: true })
                .describe(
                  "An album entered by hand: title, artist and the original year, or for a live album the recording year, are required.",
                ),
            ]),
          )
          .min(1)
          .max(50),
        listId: uuid
          .nullable()
          .optional()
          .describe("The list to put them in; Unsorted if left out."),
        idempotencyKey,
      }),
      outputSchema: output({ item: z.number(), albumId: uuid }),
      annotations: { ...writes, openWorldHint: true },
    },
    async (args) =>
      run("add_albums", args, ({ record }) => {
        const items: PlannedItem[] = [];
        const targets: Plan["targets"] = [];
        const listId = args.listId ?? null;
        for (const [index, item] of args.items.entries()) {
          const albumId = record(`album:${index}`);
          if ("link" in item) {
            items.push({
              name: "album.capture",
              args: {
                albumId,
                link: item.link,
                listId,
                ...(item.details ? { details: { ...emptyAlbum, ...item.details } } : {}),
              },
            });
            targets.push({ item: index, albumId });
            continue;
          }
          items.push({ name: "album.create", args: { id: albumId, ...emptyAlbum, ...item } });
          if (listId === null) {
            targets.push({ item: index, albumId });
            continue;
          }
          items.push({
            name: "membership.add",
            args: { listId, albumId },
            after: [items.length - 1],
          });
          targets.push(undefined, { item: index, albumId });
        }
        return { items, targets };
      }),
  );

  server.registerTool(
    "update_album",
    {
      title: "Edit an album",
      description:
        "Changes an album's information: title, artist, release type, live, and years. Pass base, the values you read for the fields you change, to be told if they changed since (a conflict, with the current values); otherwise the values saved now are replaced.",
      inputSchema: z.object({
        albumId: uuid,
        values: albumValues,
        base: albumValues.optional(),
        idempotencyKey,
      }),
      outputSchema: output({ albumId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const current = await albumBase(db, { ownerId: userId, albumId: args.albumId });
      const changed = albumFields.filter((field) => args.values[field] !== undefined);
      const base: Partial<AlbumFields> = {};
      for (const field of changed) {
        const given = args.base?.[field];
        Object.assign(base, { [field]: given === undefined ? (current?.[field] ?? null) : given });
      }
      return run("update_album", args, () =>
        each(
          [{ name: "album.update", args: { id: args.albumId, ...args.values }, base }],
          [{ albumId: args.albumId }],
        ),
      );
    },
  );

  server.registerTool(
    "set_artwork",
    {
      title: "Set an album's artwork",
      description: "Sets an album's artwork to an https image link, or clears it with null.",
      inputSchema: z.object({
        albumId: uuid,
        artworkUrl: z.string().nullable(),
        base: z.object({ artworkUrl: z.string().nullable() }).optional(),
        idempotencyKey,
      }),
      outputSchema: output({ albumId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const current = await albumBase(db, { ownerId: userId, albumId: args.albumId });
      const base = args.base ?? { artworkUrl: current?.artworkUrl ?? null };
      return run("set_artwork", args, () =>
        each(
          [
            {
              name: "album.setArtwork",
              args: { id: args.albumId, artworkUrl: args.artworkUrl },
              base,
            },
          ],
          [{ albumId: args.albumId }],
        ),
      );
    },
  );

  server.registerTool(
    "set_link",
    {
      title: "Set an album's streaming link",
      description:
        "Adds or replaces an album's link for one streaming service, from a link you found. It must be that service's link to an album.",
      inputSchema: z.object({
        albumId: uuid,
        service: z.enum(streamingServices),
        url: z.string(),
        idempotencyKey,
      }),
      outputSchema: output({ albumId: uuid, service: z.string() }),
      annotations: { ...writes, openWorldHint: true },
    },
    async (args) => {
      const url = await linkBase(db, {
        ownerId: userId,
        albumId: args.albumId,
        service: args.service,
      });
      return run("set_link", args, () =>
        each(
          [
            {
              name: "link.set",
              args: { albumId: args.albumId, service: args.service, url: args.url },
              base: { url },
            },
          ],
          [{ albumId: args.albumId, service: args.service }],
        ),
      );
    },
  );

  server.registerTool(
    "remove_link",
    {
      title: "Remove an album's streaming link",
      description: "Removes an album's link for one streaming service. The album stays.",
      inputSchema: z.object({
        albumId: uuid,
        service: z.enum(streamingServices),
        idempotencyKey,
      }),
      outputSchema: output({ albumId: uuid, service: z.string() }),
      annotations: writes,
    },
    async (args) => {
      const url = await linkBase(db, {
        ownerId: userId,
        albumId: args.albumId,
        service: args.service,
      });
      return run("remove_link", args, () =>
        each(
          [
            {
              name: "link.remove",
              args: { albumId: args.albumId, service: args.service },
              base: { url: url ?? "" },
            },
          ],
          [{ albumId: args.albumId, service: args.service }],
        ),
      );
    },
  );

  server.registerTool(
    "set_album_fields",
    {
      title: "Set albums' custom fields",
      description: `Changes custom fields on albums, at most ${maxPairedChanges} changes: apply a field (empty), set its value (applying it first if needed), clear its value (it stays applied), or remove it with its value. A value is text, a number or a date as text (YYYY-MM-DD), true or false, or a choice field's option ID (an array of IDs for multiple choice); list_fields gives the IDs.`,
      inputSchema: z.object({
        changes: z
          .array(
            z.object({
              albumId: uuid,
              fieldId: uuid,
              action: z.enum(["apply", "set", "clear", "remove"]),
              value: z
                .union([z.string(), z.boolean(), z.array(uuid)])
                .optional()
                .describe("For set."),
            }),
          )
          .min(1)
          // A set applies the field first: two envelopes.
          .max(maxPairedChanges),
        idempotencyKey,
      }),
      outputSchema: output({ change: z.number(), albumId: uuid, fieldId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const current = await Promise.all(
        args.changes.map((change) =>
          change.action === "set" || change.action === "clear"
            ? fieldValueBase(db, {
                ownerId: userId,
                albumId: change.albumId,
                fieldId: change.fieldId,
              })
            : Promise.resolve(undefined),
        ),
      );
      return run("set_album_fields", args, () => {
        const items: PlannedItem[] = [];
        const targets: Plan["targets"] = [];
        for (const [index, { albumId, fieldId, action, value }] of args.changes.entries()) {
          const target = { change: index, albumId, fieldId };
          const pair = { albumId, fieldId };
          if (action === "apply" || action === "remove") {
            items.push({
              name: action === "apply" ? "fieldValue.apply" : "fieldValue.remove",
              args: pair,
            });
            targets.push(target);
            continue;
          }
          const base = { value: current[index] ?? null };
          if (action === "clear") {
            items.push({ name: "fieldValue.set", args: { ...pair, value: null }, base });
            targets.push(target);
            continue;
          }
          // Applying an applied field changes nothing, so setting always applies first.
          items.push(
            { name: "fieldValue.apply", args: pair },
            {
              name: "fieldValue.set",
              args: { ...pair, value: value ?? null },
              base,
              after: [items.length],
            },
          );
          targets.push(undefined, target);
        }
        return { items, targets };
      });
    },
  );

  // Custom fields (FR-03, FR-10.4).

  server.registerTool(
    "create_field",
    {
      title: "Create a custom field",
      description:
        "Defines a custom field for the user's albums: text, number, date, yes/no, single choice or multiple choice, with a choice field's first options. Names are unique, ignoring case.",
      inputSchema: z.object({
        name: z.string(),
        type: z.enum(fieldTypes),
        options: z
          .array(z.string())
          .max(maxFieldOptions)
          .optional()
          .describe("A choice field's options, in order."),
        idempotencyKey,
      }),
      outputSchema: output({
        fieldId: uuid,
        options: z.array(z.object({ id: uuid, label: z.string() })),
      }),
      annotations: writes,
    },
    async (args) =>
      run("create_field", args, ({ record }) => {
        const id = record("field");
        const options = (args.options ?? []).map((label, index) => ({
          id: record(`option:${index}`),
          label,
        }));
        return each(
          [{ name: "field.create", args: { id, name: args.name, type: args.type, options } }],
          [{ fieldId: id, options }],
        );
      }),
  );

  server.registerTool(
    "rename_field",
    {
      title: "Rename a custom field",
      description: "Renames a custom field everywhere it is used.",
      inputSchema: z.object({
        fieldId: uuid,
        name: z.string(),
        base: z.object({ name: z.string() }).optional(),
        idempotencyKey,
      }),
      outputSchema: output({ fieldId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const field = await ownField(args.fieldId);
      const base = args.base ?? { name: field?.name ?? "" };
      return run("rename_field", args, () =>
        each(
          [{ name: "field.rename", args: { id: args.fieldId, name: args.name }, base }],
          [{ fieldId: args.fieldId }],
        ),
      );
    },
  );

  server.registerTool(
    "change_field_type",
    {
      title: "Change a custom field's type",
      description:
        "Changes the type of a custom field no album uses, in Trash or not (field_in_use otherwise). Options stay between single and multiple choice, and are discarded for any other type.",
      inputSchema: z.object({ fieldId: uuid, type: z.enum(fieldTypes), idempotencyKey }),
      outputSchema: output({ fieldId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const field = await ownField(args.fieldId);
      return run("change_field_type", args, () =>
        each(
          [
            {
              name: "field.changeType",
              args: { id: args.fieldId, type: args.type },
              base: { type: field?.type ?? args.type },
            },
          ],
          [{ fieldId: args.fieldId }],
        ),
      );
    },
  );

  server.registerTool(
    "add_options",
    {
      title: "Add options to a choice field",
      description: "Adds options at the end of a single- or multiple-choice field, in order.",
      inputSchema: z.object({
        fieldId: uuid,
        labels: z.array(z.string()).min(1).max(maxFieldOptions),
        idempotencyKey,
      }),
      outputSchema: output({ optionId: uuid, label: z.string() }),
      annotations: writes,
    },
    async (args) =>
      run("add_options", args, ({ record }) => {
        const options = args.labels.map((label, index) => ({
          optionId: record(`option:${index}`),
          label,
        }));
        return each(
          options.map(({ optionId, label }) => ({
            name: "field.addOption",
            args: { fieldId: args.fieldId, id: optionId, label },
          })),
          options,
        );
      }),
  );

  server.registerTool(
    "rename_option",
    {
      title: "Rename an option",
      description: "Relabels a choice field's option; albums that chose it keep it.",
      inputSchema: z.object({
        fieldId: uuid,
        optionId: uuid,
        label: z.string(),
        base: z.object({ label: z.string() }).optional(),
        idempotencyKey,
      }),
      outputSchema: output({ optionId: uuid }),
      annotations: writes,
    },
    async (args) => {
      const field = await ownField(args.fieldId);
      const option = field?.options.find((candidate) => candidate.id === args.optionId);
      const base = args.base ?? { label: option?.label ?? "" };
      return run("rename_option", args, () =>
        each(
          [
            {
              name: "field.renameOption",
              args: { fieldId: args.fieldId, optionId: args.optionId, label: args.label },
              base,
            },
          ],
          [{ optionId: args.optionId }],
        ),
      );
    },
  );

  // Trash (FR-10.7, FR-01.13 to FR-01.16, FR-14.2).

  server.registerTool(
    "recover_from_trash",
    {
      title: "Recover from Trash",
      description:
        "Recovers what was deleted to Trash, unit by unit (list_trash gives the unitIds): a folder with what was inside it, a list, or an album, back where it was. Each recovers on its own. One whose folder is gone or in Trash answers needs_input with need destination: send it again with parentId, a folder or null for the top level. One whose name is taken there answers need name: send it again with another name. A recovered list's albums that are in Trash or gone are reported as skipped. An album comes back to its lists. Each reports who sees it again. A unit past its 30 days is no longer recoverable. Deleting from Trash for good stays in the app.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              unitId: uuid,
              parentId: uuid
                .nullable()
                .optional()
                .describe(
                  "Where to put a folder or list instead: a folder, or null for the top level.",
                ),
              name: z.string().optional().describe("Another name, when its own is taken there."),
            }),
          )
          .min(1)
          .max(50),
        idempotencyKey,
      }),
      outputSchema: output({ unitId: uuid }),
      annotations: writes,
    },
    async (args) => {
      // As the app previews them (FR-07.14), reported with each outcome.
      const effects = await Promise.all(
        args.items.map(({ unitId, parentId }) =>
          sharingEffects(db, userId, {
            kind: "recover",
            unitId,
            ...(parentId === undefined ? {} : { to: parentId }),
          }),
        ),
      );
      return run("recover_from_trash", args, () =>
        each(
          args.items.map(({ unitId, parentId, name }) => ({
            name: "trash.recover",
            args: {
              unitId,
              ...(parentId === undefined ? {} : { parentId }),
              ...(name === undefined ? {} : { name }),
            },
          })),
          args.items.map(({ unitId }, index) => ({
            unitId,
            ...(effects[index] ? { sharing: effects[index] } : {}),
          })),
        ),
      );
    },
  );

  // Shared references (FR-07.13, FR-10.4).

  server.registerTool(
    "save_shared_reference",
    {
      title: "Keep a shared link in Shared with me",
      description:
        "Saves the folder or list a Tonaris share link opens to the user's Shared with me, from the link the user gives (https://…/s/…). It reads nothing more than the link allows.",
      inputSchema: z.object({ url: z.string().max(maxLinkLength), idempotencyKey }),
      outputSchema: output({ url: z.string() }),
      annotations: { ...writes, idempotentHint: true },
    },
    async (args) => {
      const token = shareTokenOf(args.url);
      if (!token) {
        return failed(
          "validation_failed",
          "This isn't a Tonaris share link. Ask the user for the link they were given.",
        );
      }
      return run("save_shared_reference", args, () =>
        each([{ name: "share.saveLink", args: { token } }], [{ url: args.url }]),
      );
    },
  );

  server.registerTool(
    "remove_shared_reference",
    {
      title: "Drop from Shared with me",
      description:
        "Drops a folder or list from the user's Shared with me. It doesn't decline or leave an invitation, which only the user can do in the app.",
      inputSchema: z.object({ containerId: uuid, idempotencyKey }),
      outputSchema: output({ containerId: uuid }),
      annotations: { ...writes, idempotentHint: true },
    },
    async (args) =>
      run("remove_shared_reference", args, () =>
        each(
          [{ name: "share.removeReference", args: { containerId: args.containerId } }],
          [{ containerId: args.containerId }],
        ),
      ),
  );

  /** The person's own field with this ID, for a change's base. */
  async function ownField(fieldId: string) {
    const field = await findFieldIn(db, fieldId);
    return field?.ownerId === userId ? field : undefined;
  }
}

/** An album's values a hand-entered album leaves out: unknown (FR-03.1). */
const emptyAlbum = {
  releaseType: null,
  isLive: null,
  originalYear: null,
  recordingYearStart: null,
  recordingYearEnd: null,
};
