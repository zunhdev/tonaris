// A person's people (FR-07.23, TON-294): everyone connected to them by an invitation, either way, as the domain's
// `personThrough` decides, read from the grants on their folders and lists and the grants to them. For the invite
// field's suggestions (DS-65) and for `share.invite` by person.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { personThrough, type Person } from "@tonaris/domain";

import { canReadContainer } from "./access";
import { readSnapshot, type Database, type Executor } from "./client";
import { containers, shareGrants, users } from "./schema";

/** What connects one person to the reader. */
type Connection = {
  /** The newest invitation between them, either way. */
  sharedAt: Date;
  /** The address the reader last typed to invite them. */
  email: string | null;
  /** Their folders and lists the reader accepted and still has, newest first. */
  theirs: { containerId: string; name: string }[];
};

/**
 * `userId`'s people (FR-07.23), or only `only` among them, by person, with accounts being deleted left out. Grants are
 * read newest first, so the first address and share found per person are the latest.
 */
export async function connections(
  db: Executor,
  userId: string,
  only?: string,
): Promise<Map<string, Connection>> {
  const [mine, toMe] = await Promise.all([
    db
      .select({
        ownerId: containers.ownerId,
        granteeId: shareGrants.granteeId,
        status: shareGrants.status,
        acceptedAt: shareGrants.acceptedAt,
        email: shareGrants.invitedEmail,
        createdAt: shareGrants.createdAt,
      })
      .from(shareGrants)
      .innerJoin(containers, eq(containers.id, shareGrants.containerId))
      .where(
        and(
          eq(containers.ownerId, userId),
          only === undefined ? undefined : eq(shareGrants.granteeId, only),
        ),
      )
      .orderBy(desc(shareGrants.createdAt), desc(shareGrants.id)),
    db
      .select({
        ownerId: containers.ownerId,
        granteeId: shareGrants.granteeId,
        status: shareGrants.status,
        acceptedAt: shareGrants.acceptedAt,
        createdAt: shareGrants.createdAt,
        containerId: shareGrants.containerId,
        name: containers.name,
      })
      .from(shareGrants)
      .innerJoin(containers, eq(containers.id, shareGrants.containerId))
      .where(
        and(
          eq(shareGrants.granteeId, userId),
          only === undefined ? undefined : eq(containers.ownerId, only),
        ),
      )
      .orderBy(desc(shareGrants.createdAt), desc(shareGrants.id)),
  ]);
  const found = new Map<string, Connection>();
  const reach = (personId: string, at: Date): Connection => {
    const known = found.get(personId) ?? { sharedAt: at, email: null, theirs: [] };
    if (at > known.sharedAt) known.sharedAt = at;
    found.set(personId, known);
    return known;
  };
  for (const grant of [...mine, ...toMe]) {
    const personId = personThrough({ ...grant, accepted: grant.acceptedAt !== null }, userId);
    if (personId === undefined) continue;
    const known = reach(personId, grant.createdAt);
    if ("email" in grant) known.email ??= grant.email;
    else if (grant.status === "accepted") {
      known.theirs.push({ containerId: grant.containerId, name: grant.name });
    }
  }
  if (found.size === 0) return found;
  const live = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, [...found.keys()]), isNull(users.deletingAt)));
  const kept = new Set(live.map((row) => row.id));
  for (const personId of found.keys()) if (!kept.has(personId)) found.delete(personId);
  return found;
}

/**
 * `GET /v1/people` (FR-07.23): the person's people, the most recently shared with first, each with the address they
 * last typed for them and the newest share of theirs they can open now. Someone with neither a display name nor such
 * an address can't be told apart from anyone, so isn't listed.
 */
export function people(db: Database, userId: string): Promise<Person[]> {
  return readSnapshot(db, async (tx) => {
    const found = await connections(tx, userId);
    if (found.size === 0) return [];
    const names = await tx
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...found.keys()]));
    // Which of their shares open now: a folder or list in Trash, or under one, doesn't (FR-07.10).
    const shares = [...found.values()].flatMap((connection) => connection.theirs);
    const opens = new Set(
      (
        await Promise.all(
          shares.map(async ({ containerId }) =>
            (await canReadContainer(tx, { kind: "person", userId }, containerId))
              ? [containerId]
              : [],
          ),
        )
      ).flat(),
    );
    const listed: Person[] = [];
    for (const { id, displayName } of names) {
      const connection = found.get(id);
      if (!connection || (displayName === null && connection.email === null)) continue;
      listed.push({
        id,
        displayName,
        email: connection.email,
        sharedAt: connection.sharedAt.toISOString(),
        sharesWithYou:
          connection.theirs.find((share) => opens.has(share.containerId))?.name ?? null,
      });
    }
    return listed.toSorted(
      (a, b) => b.sharedAt.localeCompare(a.sharedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  });
}
