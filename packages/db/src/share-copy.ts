// What copying a share adds, before it runs (FR-07.22; TON-133): the domain's plan, on one snapshot of the person's
// collection and the share, so the preview counts what `share.copy` would, and so does an AI client's approval.

import { eq } from "drizzle-orm";

import { planShareCopy, uuidv7, type ApprovalScope, type ShareCopyPreview } from "@tonaris/domain";

import { readSnapshot, type Database, type Transaction } from "./client";
import { containers, users } from "./schema";
import { collectionStore } from "./store";

type Refusal = { code: string; detail: string };

async function previewIn(
  tx: Transaction,
  ownerId: string,
  containerId: string,
  parentId: string | null,
): Promise<ShareCopyPreview | Refusal> {
  const plan = await planShareCopy(collectionStore(tx), {
    ownerId,
    containerId,
    parentId,
    copyId: uuidv7(),
  });
  return "status" in plan
    ? { code: plan.code, detail: plan.problem.detail ?? "It can't be copied." }
    : plan.preview;
}

/**
 * The preview of copying `containerId` into `ownerId`'s collection under `parentId`: what it adds and any limit it
 * would exceed; or why it can't be copied there, the refusal `share.copy` would give.
 */
export function previewShareCopy(
  db: Database,
  ownerId: string,
  containerId: string,
  parentId: string | null,
): Promise<ShareCopyPreview | Refusal> {
  return readSnapshot(db, (tx) => previewIn(tx, ownerId, containerId, parentId));
}

/**
 * An AI client's copy as the person approves it (FR-07.22, FR-10.6): the share, the copy's name and destination, and
 * what it adds; or why it can't be copied. Read in the approval's transaction, so a share that changed asks again.
 */
export async function copyApprovalScope(
  tx: Transaction,
  {
    ownerId,
    containerId,
    parentId,
    name,
  }: {
    ownerId: string;
    containerId: string;
    parentId: string | null;
    name: string | undefined;
  },
): Promise<ApprovalScope | Refusal> {
  const preview = await previewIn(tx, ownerId, containerId, parentId);
  if ("code" in preview) return preview;
  const [shared] = await tx
    .select({ name: containers.name, kind: containers.kind, ownerName: users.displayName })
    .from(containers)
    .innerJoin(users, eq(users.id, containers.ownerId))
    .where(eq(containers.id, containerId));
  const [destination] =
    parentId === null
      ? []
      : await tx
          .select({ name: containers.name })
          .from(containers)
          .where(eq(containers.id, parentId));
  if (!shared) return { code: "not_found", detail: "This shared folder or list isn't available." };
  return {
    operation: "copy_share",
    albums: [],
    recoverableDays: 0,
    copy: {
      containerId,
      name: shared.name,
      kind: shared.kind,
      ownerName: shared.ownerName,
      copyName: name?.trim() || shared.name,
      parentId,
      destination: destination?.name ?? null,
      preview,
    },
  };
}

/** `copyApprovalScope` on its own snapshot: what an AI client would ask the person to approve now. */
export function readCopyApprovalScope(
  db: Database,
  target: Parameters<typeof copyApprovalScope>[1],
): Promise<ApprovalScope | Refusal> {
  return readSnapshot(db, (tx) => copyApprovalScope(tx, target));
}
