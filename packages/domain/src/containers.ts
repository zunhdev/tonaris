// Folders, lists and list entries as clients hold them (TS-11, TS-24). Read-only in the sync protocol so far:
// bootstrap carries them (TON-21); their commands and changes arrive with M2 (TON-26, TON-27).

import { z } from "./zod";

export const containerKinds = ["folder", "list"] as const;
export type ContainerKind = (typeof containerKinds)[number];

/** A folder or list. `parentId` null is the root (FR-01.3). */
export const containerSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(containerKinds),
    parentId: z.uuid().nullable(),
    name: z.string(),
  })
  .meta({ description: "A folder or list (FR-01.1)." });
export type Container = z.infer<typeof containerSchema>;

/** An album's entry in a list (FR-01.6). `addedAt` orders entries that have no manual position (TS-16). */
export const membershipSchema = z
  .object({ listId: z.uuid(), albumId: z.uuid(), addedAt: z.iso.datetime() })
  .meta({ description: "An album's entry in a list (FR-01.6)." });
export type Membership = z.infer<typeof membershipSchema>;
