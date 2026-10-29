// The approval-gated tools (TS-63, TS-64, FR-10.6), offered to Manage collection connections: deleting folders,
// lists and albums to Trash, deleting a field for good, removing options albums choose, and confirming which album a
// link is. The first call stores the exact scope and answers `needs_approval` with a link to Tonaris's approval page
// (DS-87), and the agent relays its summary to the owner. Called again with the approvalId, the tool runs the app's own
// commands, only while the owner's approval holds for exactly that scope. Sharing effects are part of what the owner
// sees (FR-07.14). Permission alone never stands in for an approval.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  activeListName,
  deletionTargets,
  fieldDeletionIn,
  findApproval,
  optionRemovalsIn,
  savedAlbumOfReleaseGroup,
  type Database,
  type Transaction,
} from "@tonaris/db";
import {
  fieldDeletionApprovalScope,
  itemsDeletionScope,
  matchScope,
  optionsRemovalScope,
  type ApprovalScope,
  type McpPrincipal,
} from "@tonaris/domain";

import { gated, type GatedAnswer, type GatedRequest } from "./approvals";
import { failed, result } from "./results";
import { agentOutcome, countsOf } from "./write-tools";
import type { McpWriter, PlannedItem } from "./writes";

const gatedHints = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const uuid = z.uuid();

const approvalId = uuid
  .optional()
  .describe(
    "The approvalId from this tool's earlier needs_approval answer, once the owner approved it in Tonaris.",
  );

const idempotencyKey = z
  .string()
  .min(1)
  .max(100)
  .optional()
  .describe(
    "As for the other writes: send the same key again to retry the approved change safely.",
  );

/** How every gated tool's description explains the round trip. */
const roundTrip =
  "This needs the owner's approval in Tonaris: the first call returns status needs_approval with a summary, what happens, and a link. Show them to the user and ask them to approve there. Once they have, call again with the same arguments and the approvalId; check it first with get_approval if unsure. Tonaris checks the approval itself, and asks again if what this does changed meanwhile; never call again claiming an approval the user didn't give.";

export type GatedToolsContext = {
  db: Database;
  principal: McpPrincipal;
  writer: McpWriter;
  webOrigin: string;
};

export function registerGatedTools(
  server: McpServer,
  { db, principal, writer, webOrigin }: GatedToolsContext,
): void {
  const { userId: ownerId } = principal;
  const context = { db, principal, writer, webOrigin };

  /** Answers a gated tool: its approval to ask for, or the changes it made with their outcomes. */
  async function answer(
    request: GatedRequest,
    targets: (approved: ApprovalScope) => Record<string, unknown>[],
  ) {
    let approved: ApprovalScope | undefined;
    const answered: GatedAnswer = await gated(context, {
      ...request,
      plan: (ids, scope) => {
        approved = scope;
        return request.plan(ids, scope);
      },
    });
    if (answered.status === "needs_approval") {
      return result(
        `Waiting for the owner's approval: ${answered.summary}. Ask them to approve at ${answered.url}, then call again with approvalId ${answered.approvalId}.${answered.note ? ` ${answered.note}` : ""}`,
        answered,
      );
    }
    if (answered.status === "declined") {
      return result("The owner declined. Nothing changed.", answered);
    }
    if (answered.status === "failed") return failed(answered.code, answered.message);
    const named = approved ? targets(approved) : [];
    const items = answered.items.map((item, index) => ({
      ...named[index],
      outcome: agentOutcome(item.outcome, answered.items),
    }));
    const done = items.every((item) => item.outcome.status === "confirmed");
    return result(
      `${done ? "Done" : "Not all done"}: ${countsOf(items.map((item) => item.outcome))}.`,
      { status: "ran", idempotencyKey: answered.idempotencyKey, items },
    );
  }

  server.registerTool(
    "delete_items",
    {
      title: "Delete to Trash",
      description: `Moves folders (with everything inside them), lists and albums to Trash, where they can be recovered for 30 days. Albums in deleted lists stay in the collection, in their other lists or Unsorted; a deleted album leaves every list. Whoever the content is shared with no longer sees it. ${roundTrip}`,
      inputSchema: z.object({
        containerIds: z.array(uuid).max(200).optional().describe("Folders and lists to delete."),
        albumIds: z.array(uuid).max(200).optional().describe("Albums to delete."),
        approvalId,
        idempotencyKey,
      }),
      annotations: gatedHints,
    },
    async (args) => {
      const containerIds = args.containerIds ?? [];
      const albumIds = args.albumIds ?? [];
      if (containerIds.length + albumIds.length === 0) {
        return failed("validation_failed", "Name the folders, lists or albums to delete.");
      }
      if (containerIds.length + albumIds.length > 200) {
        return failed("validation_failed", "That is more than 200 items in one call. Split it.");
      }
      return answer(
        {
          tool: "delete_items",
          operation: "delete_items",
          args,
          missing: "None of these is in the collection; they may already be in Trash.",
          scope: async (tx) => {
            const targets = await deletionTargets(tx, { ownerId, albumIds, containerIds });
            return targets.albums.length + targets.containers.length === 0
              ? undefined
              : itemsDeletionScope(targets);
          },
          plan: ({ record }, approved) => [
            ...(approved.containers ?? []).map((container): PlannedItem => ({
              name: "container.delete",
              args: { id: container.id, unitId: record(`unit:${container.id}`) },
            })),
            ...approved.albums.map((album): PlannedItem => ({
              name: "album.delete",
              args: { id: album.id, unitId: record(`unit:${album.id}`) },
            })),
          ],
        },
        (approved) => [
          ...(approved.containers ?? []).map((container) => ({ containerId: container.id })),
          ...approved.albums.map((album) => ({ albumId: album.id })),
        ],
      );
    },
  );

  server.registerTool(
    "delete_field",
    {
      title: "Delete a custom field for good",
      description: `Deletes a custom field permanently, with its options and every album's value, in Trash too. It can't be undone, even for a field no album uses. ${roundTrip}`,
      inputSchema: z.object({ fieldId: uuid, approvalId, idempotencyKey }),
      annotations: gatedHints,
    },
    async (args) =>
      answer(
        {
          tool: "delete_field",
          operation: "delete_field",
          args,
          missing: "There is no such custom field.",
          scope: async (tx) => {
            const deletion = await fieldDeletionIn(tx, ownerId, args.fieldId);
            return deletion && fieldDeletionApprovalScope(deletion);
          },
          plan: (_, approved) => [
            {
              name: "field.delete",
              args: { id: args.fieldId, scopeHash: approved.checks?.[0] ?? "" },
            },
          ],
        },
        () => [{ fieldId: args.fieldId }],
      ),
  );

  /** The scope of removing `optionIds`, read in `tx`; undefined if any isn't an option of the owner's field. */
  const removalScope = async (tx: Transaction, fieldId: string, optionIds: readonly string[]) => {
    const found = await optionRemovalsIn(tx, ownerId, fieldId, optionIds);
    return found && optionsRemovalScope(found.field, found.removals);
  };

  server.registerTool(
    "remove_options",
    {
      title: "Remove options from a choice field",
      description: `Removes options from a single- or multiple-choice field. Options no album chooses are removed at once. If any is chosen, in Trash too, removing them clears them from those albums, so the whole removal needs approval: ${roundTrip}`,
      inputSchema: z.object({
        fieldId: uuid,
        optionIds: z.array(uuid).min(1).max(100),
        approvalId,
        idempotencyKey,
      }),
      annotations: gatedHints,
    },
    async (args) => {
      if (!args.approvalId) {
        const scope = await db.transaction((tx) => removalScope(tx, args.fieldId, args.optionIds), {
          isolationLevel: "repeatable read",
          accessMode: "read only",
        });
        if (!scope) return failed("not_found", "These aren't all options of one of your fields.");
        // Unused options are an ordinary change (FR-10.4); one becoming used meanwhile fails as field_in_use.
        if ((scope.field?.albums ?? 0) + (scope.field?.inTrash ?? 0) === 0) {
          const written = await writer.write(principal, {
            tool: "remove_options",
            args,
            idempotencyKey: args.idempotencyKey,
            plan: () =>
              args.optionIds.map((optionId) => ({
                name: "field.removeOption",
                args: { fieldId: args.fieldId, optionId },
              })),
          });
          if (written.status === "key_reused") {
            return failed(
              "validation_failed",
              "This idempotencyKey was already used for a different change.",
            );
          }
          const items = written.items.map((item, index) => ({
            optionId: args.optionIds[index],
            outcome: agentOutcome(item.outcome, written.items),
          }));
          return result(`Done: ${countsOf(items.map((item) => item.outcome))}.`, {
            status: "ran",
            idempotencyKey: written.idempotencyKey,
            items,
          });
        }
      }
      return answer(
        {
          tool: "remove_options",
          operation: "remove_options",
          args,
          missing: "These aren't all options of one of your fields.",
          scope: (tx) => removalScope(tx, args.fieldId, args.optionIds),
          plan: (_, approved) =>
            (approved.options ?? []).map((option, index) => ({
              name: "field.removeOption",
              args: {
                fieldId: args.fieldId,
                optionId: option.id,
                scopeHash: approved.checks?.[index] ?? "",
              },
            })),
        },
        (approved) => (approved.options ?? []).map((option) => ({ optionId: option.id })),
      );
    },
  );

  server.registerTool(
    "confirm_match",
    {
      title: "Confirm which album a link is",
      description: `After add_albums answered need match for a link, confirms which of its candidates the album is, by releaseGroupId, and adds it, optionally into a list. A candidate the user already has joins that album instead of making a new one. ${roundTrip}`,
      inputSchema: z.object({
        link: z.string(),
        releaseGroupId: uuid.describe("The chosen candidate's releaseGroupId."),
        listId: uuid.nullable().optional().describe("The list to put it in; Unsorted if left out."),
        approvalId,
        idempotencyKey,
      }),
      annotations: { ...gatedHints, destructiveHint: false, openWorldHint: true },
    },
    async (args) => {
      const listId = args.listId ?? null;
      let title: string | undefined;
      if (args.approvalId) {
        const approval = await findApproval(db, args.approvalId);
        title = approval?.scope.match?.title;
      } else {
        // Ask the link's candidates again, so the owner sees Tonaris's names for them, not the agent's.
        const probe = await writer.write(principal, {
          tool: "confirm_match:probe",
          args: { link: args.link, listId },
          idempotencyKey: undefined,
          plan: ({ record }) => [
            { name: "album.capture", args: { albumId: record("album"), link: args.link, listId } },
          ],
        });
        const outcome = probe.status === "ran" ? probe.items[0]?.outcome : undefined;
        if (outcome?.status !== "needs_input" || outcome.need !== "match") {
          return result(
            outcome?.status === "confirmed"
              ? "This link needed no choice: it was added."
              : "This link doesn't need a choice of album now.",
            { status: "no_choice", outcome: outcome && agentOutcome(outcome, []) },
            outcome?.status !== "confirmed",
          );
        }
        const candidate = z
          .array(z.looseObject({ releaseGroupId: z.string(), title: z.string() }))
          .parse(outcome.candidates)
          .find((each) => each.releaseGroupId === args.releaseGroupId);
        if (!candidate) {
          return failed(
            "validation_failed",
            "That isn't one of this link's candidates. Use a releaseGroupId add_albums offered.",
          );
        }
        title = candidate.title;
      }
      const chosen = title;
      if (chosen === undefined)
        return failed("not_found", "There is no such approval for this change.");
      return answer(
        {
          tool: "confirm_match",
          operation: "confirm_match",
          args,
          missing: "That list isn't in the collection.",
          outsideLock: true,
          scope: async (tx) => {
            const listName = listId === null ? null : await activeListName(tx, { ownerId, listId });
            if (listName === undefined) return undefined;
            const saved = await savedAlbumOfReleaseGroup(tx, {
              ownerId,
              releaseGroupId: args.releaseGroupId,
            });
            return matchScope(
              {
                link: args.link,
                releaseGroupId: args.releaseGroupId,
                title: chosen,
                listId,
                listName,
              },
              saved,
            );
          },
          plan: ({ record }) => [
            {
              name: "album.capture",
              args: {
                albumId: record("album"),
                link: args.link,
                listId,
                releaseGroupId: args.releaseGroupId,
              },
            },
          ],
        },
        () => [{ link: args.link }],
      );
    },
  );
}
