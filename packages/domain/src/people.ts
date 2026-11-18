// A person's people (FR-07.23, TON-294): everyone connected to them by an invitation, either way. Nobody can be found
// otherwise, so the PRD's exclusion of follows and discovery stands (section 2.6). `personThrough` is the rule; the
// database's read and the store's `findPerson` follow it, and are tested against it.

import type { ShareGrantStatus } from "./sharing";
import { z } from "./zod";

/** An invitation as the rule reads it: whose folder or list, to whom, its status, and whether it was ever accepted. */
export type PeopleGrant = {
  ownerId: string;
  granteeId: string;
  status: ShareGrantStatus;
  /** Accepted at some point, even if left or revoked since. */
  accepted: boolean;
};

/**
 * The person `grant` connects `userId` with, if any (FR-07.23): whom they invited, unless that invitation was declined,
 * and who invited them, once they accepted. Leaving or a revocation keeps the connection.
 */
export function personThrough(grant: PeopleGrant, userId: string): string | undefined {
  if (grant.ownerId === grant.granteeId) return undefined;
  if (grant.ownerId === userId && grant.status !== "declined") return grant.granteeId;
  if (grant.granteeId === userId && grant.accepted) return grant.ownerId;
  return undefined;
}

/** One of the signed-in person's people (FR-07.23), as `GET /v1/people` gives them. */
export const personSchema = z
  .object({
    id: z.uuid(),
    displayName: z.string().nullable(),
    email: z.string().nullable().meta({
      description:
        "The address the signed-in person last typed to invite them; null if they never did. Someone who only invited them never shows theirs (FR-07.3).",
    }),
    sharedAt: z.iso.datetime().meta({
      description: "When the newest invitation between them was made, either way.",
    }),
    sharesWithYou: z.string().nullable().meta({
      description:
        "The name of the newest folder or list they share with the signed-in person that they can open now; null if none.",
    }),
  })
  .meta({ description: "Someone connected to the signed-in person by an invitation (FR-07.23)." });
export type Person = z.infer<typeof personSchema>;

/** `GET /v1/people`: the signed-in person's people, the most recently shared with first. */
export const peopleSchema = z.object({ people: z.array(personSchema) });
