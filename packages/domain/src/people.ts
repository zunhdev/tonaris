// A person's people (FR-07.23, TON-294): everyone connected to them by an invitation, either way. Nobody can be found
// otherwise, so the PRD's exclusion of follows and discovery stands (section 2.6). `personThrough` is the rule; the
// database's read and the store's `findPerson` follow it, and are tested against it.

import { actingOwner, applied, isFailure } from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import { containerKinds } from "./containers";
import { avatarHueSchema } from "./profiles";
import { openGrantStatuses, shareRoles, type ShareGrantStatus } from "./sharing";
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
    avatarHue: avatarHueSchema,
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
    yours: z
      .object({
        folders: z.int().min(0),
        lists: z.int().min(0),
        toEdit: z.int().min(0).meta({ description: "Those of them they can edit (FR-07.18)." }),
      })
      .meta({
        description:
          "The signed-in person's folders and lists outside Trash with an invitation to them, pending or accepted (FR-07.24).",
      }),
    theirs: z.object({ folders: z.int().min(0), lists: z.int().min(0) }).meta({
      description:
        "Their folders and lists the signed-in person accepted and can open now (FR-07.24).",
    }),
  })
  .meta({ description: "Someone connected to the signed-in person by an invitation (FR-07.23)." });
export type Person = z.infer<typeof personSchema>;

/** `GET /v1/people`: the signed-in person's people, the most recently shared with first. */
export const peopleSchema = z.object({ people: z.array(personSchema) });

/** A folder or list shared one way between the signed-in person and someone else, on that person's page (DS-121). */
export const personShareSchema = z.object({
  grantId: z.uuid().meta({
    description:
      "The invitation: one of theirs to the signed-in person opens its page while pending.",
  }),
  containerId: z.uuid(),
  name: z.string(),
  kind: z.enum(containerKinds),
  role: z.enum(shareRoles),
  status: z.enum(openGrantStatuses),
});
export type PersonShare = z.infer<typeof personShareSchema>;

/** `GET /v1/people/{id}`: one of the signed-in person's people, and what's shared each way, by name (FR-07.24). */
export const personSharesSchema = z
  .object({
    person: personSchema,
    about: z.string().nullable().meta({
      description:
        "Their About text, while the signed-in person is one of their people from their side: invited by them, or whose invitation they accepted (FR-11.16); else null.",
    }),
    yours: z.array(personShareSchema).meta({
      description:
        "The signed-in person's folders and lists outside Trash with an open invitation to them.",
    }),
    theirs: z.array(personShareSchema).meta({
      description:
        "Theirs the signed-in person is invited to, pending, or accepted and can open now, outside Trash.",
    }),
  })
  .meta({
    description: "What's shared each way with one of the signed-in person's people (DS-121).",
  });
export type PersonShares = z.infer<typeof personSharesSchema>;

/** `share.revokePerson`'s and `people.remove`'s argument: the person. */
export const personArgsSchema = z.object({ personId: z.uuid() });

/**
 * `share.revokePerson` (FR-07.15, FR-07.24): the owner revokes every pending or accepted invitation of theirs to the
 * person, Trash included, as `share.revoke` does each: their shares with the owner stay, and so does the connection
 * (FR-07.23). Someone with none answers 0. App-only (X-03).
 */
export async function revokePerson(
  { personId }: z.infer<typeof personArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = actingOwner(
    context,
    "sharing",
    "Sharing is stopped in the app.",
    "Sign in to stop sharing.",
  );
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  let revoked = 0;
  for (const grant of await store.openGrantsTo(ownerId, personId)) {
    // One at a time, as each is conditional on its status: an answer meanwhile wins (TON-67).
    // oxlint-disable-next-line no-await-in-loop
    if (await store.moveGrant(grant.id, grant.status, "revoked")) revoked += 1;
  }
  return { status: "applied", changes: [], result: { revoked } };
}

/**
 * `people.remove` (FR-07.23, FR-07.24): the person leaves the owner's People and the invite suggestions until a later
 * invitation either way connects them again. It revokes nothing. Anyone, connected or not, answers the same. App-only
 * (X-03).
 */
export async function removePerson(
  { personId }: z.infer<typeof personArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const userId = actingOwner(
    context,
    "sharing",
    "People are removed in the app.",
    "Sign in to remove someone from People.",
  );
  if (isFailure(userId)) return userId;
  if (personId !== userId) await context.store.hidePerson(userId, personId);
  return applied();
}
