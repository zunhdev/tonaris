// A person's people (FR-07.23, FR-07.24; TON-294, TON-295): everyone connected to them by an invitation, either way,
// as the domain's `personThrough` decides, read from the grants on their folders and lists and the grants to them,
// less those they removed from People since their last connection. For the invite field's suggestions (DS-65), the
// People page and a person's page (DS-121), and `share.invite` by person.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  byBytes,
  openGrantStatuses,
  personThrough,
  searchKey,
  type ContainerKind,
  type Person,
  type PersonShare,
  type PersonShares,
  type ShareGrantStatus,
  type ShareRole,
} from "@tonaris/domain";

import { canReadContainer } from "./access";
import { readSnapshot, type Database, type Executor } from "./client";
import { containers, peopleHidden, shareGrants, users } from "./schema";

/** A folder or list shared one way, with whether it is in Trash. */
type Share = {
  grantId: string;
  containerId: string;
  name: string;
  kind: ContainerKind;
  role: ShareRole;
  status: ShareGrantStatus;
  trashed: boolean;
};

/** What connects one person to the reader. */
type Connection = {
  /** The newest invitation between them, either way. */
  sharedAt: Date;
  /** The latest connection: an invitation the reader made, or the acceptance of one to them. */
  connectedAt: Date;
  /** The address the reader last typed to invite them. */
  email: string | null;
  /** The reader's pending and accepted invitations to them, newest first. */
  yours: Share[];
  /** Their invitations to the reader, newest first. */
  theirs: Share[];
};

const isOpen = (status: ShareGrantStatus) => openGrantStatuses.some((open) => open === status);

/**
 * `userId`'s people (FR-07.23), or only `only` among them, by person: accounts being deleted are left out, and so is
 * anyone removed from People with no connection since (FR-07.24). Grants are read newest first, so the first address
 * and share found per person are the latest.
 */
export async function connections(
  db: Executor,
  userId: string,
  only?: string,
): Promise<Map<string, Connection>> {
  const columns = {
    grantId: shareGrants.id,
    containerId: shareGrants.containerId,
    ownerId: containers.ownerId,
    granteeId: shareGrants.granteeId,
    status: shareGrants.status,
    role: shareGrants.role,
    acceptedAt: shareGrants.acceptedAt,
    createdAt: shareGrants.createdAt,
    email: shareGrants.invitedEmail,
    name: containers.name,
    kind: containers.kind,
    trashedAt: containers.trashedAt,
  };
  const [mine, toMe, hidden] = await Promise.all([
    db
      .select(columns)
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
      .select(columns)
      .from(shareGrants)
      .innerJoin(containers, eq(containers.id, shareGrants.containerId))
      .where(
        and(
          eq(shareGrants.granteeId, userId),
          only === undefined ? undefined : eq(containers.ownerId, only),
        ),
      )
      .orderBy(desc(shareGrants.createdAt), desc(shareGrants.id)),
    db
      .select({ personId: peopleHidden.personId, hiddenAt: peopleHidden.hiddenAt })
      .from(peopleHidden)
      .where(
        and(
          eq(peopleHidden.userId, userId),
          only === undefined ? undefined : eq(peopleHidden.personId, only),
        ),
      ),
  ]);
  const found = new Map<string, Connection>();
  // First who is connected, by the grants that connect them; then every grant between them, each way.
  const connect = (grant: (typeof mine)[number], made: boolean) => {
    const personId = personThrough({ ...grant, accepted: grant.acceptedAt !== null }, userId);
    if (personId === undefined) return;
    const connected = made ? grant.createdAt : (grant.acceptedAt ?? grant.createdAt);
    const known = found.get(personId);
    if (!known) {
      found.set(personId, {
        sharedAt: grant.createdAt,
        connectedAt: connected,
        email: null,
        yours: [],
        theirs: [],
      });
      return;
    }
    if (grant.createdAt > known.sharedAt) known.sharedAt = grant.createdAt;
    if (connected > known.connectedAt) known.connectedAt = connected;
  };
  for (const grant of mine) connect(grant, true);
  for (const grant of toMe) connect(grant, false);
  for (const grant of mine) {
    const known = found.get(grant.granteeId);
    if (!known) continue;
    known.email ??= grant.email;
    if (isOpen(grant.status)) known.yours.push({ ...grant, trashed: grant.trashedAt !== null });
  }
  for (const grant of toMe) {
    found.get(grant.ownerId)?.theirs.push({ ...grant, trashed: grant.trashedAt !== null });
  }
  for (const { personId, hiddenAt } of hidden) {
    const known = found.get(personId);
    if (known && known.connectedAt <= hiddenAt) found.delete(personId);
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

/** Their accepted folders and lists among `found` that `userId` can open now: one in Trash, or under one, can't. */
async function opening(
  db: Executor,
  userId: string,
  found: ReadonlyMap<string, Connection>,
): Promise<Set<string>> {
  const accepted = [...found.values()].flatMap((connection) =>
    connection.theirs.filter((share) => share.status === "accepted"),
  );
  const opens = await Promise.all(
    accepted.map(async ({ containerId }) =>
      (await canReadContainer(db, { kind: "person", userId }, containerId)) ? [containerId] : [],
    ),
  );
  return new Set(opens.flat());
}

/** Shares counted by kind. */
const counted = (shares: readonly Share[]) => ({
  folders: shares.filter((share) => share.kind === "folder").length,
  lists: shares.filter((share) => share.kind === "list").length,
});

/** A person as `GET /v1/people` gives them, or undefined for someone with neither a name nor an address typed. */
function personOf(
  id: string,
  displayName: string | null,
  connection: Connection,
  opens: ReadonlySet<string>,
): Person | undefined {
  if (displayName === null && connection.email === null) return undefined;
  const yours = connection.yours.filter((share) => !share.trashed);
  const theirs = connection.theirs.filter(
    (share) => share.status === "accepted" && opens.has(share.containerId),
  );
  return {
    id,
    displayName,
    email: connection.email,
    sharedAt: connection.sharedAt.toISOString(),
    sharesWithYou: theirs[0]?.name ?? null,
    yours: { ...counted(yours), toEdit: yours.filter((share) => share.role === "edit").length },
    theirs: counted(theirs),
  };
}

/** The display names of `ids`, by ID. */
async function displayNames(
  db: Executor,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const rows = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.displayName]));
}

/**
 * `GET /v1/people` (FR-07.23, FR-07.24): the person's people, the most recently shared with first, each with the
 * address they last typed for them, the newest share of theirs that opens, and what's shared each way, counted. Someone
 * with neither a display name nor such an address can't be told apart from anyone, so isn't listed.
 */
export function people(db: Database, userId: string): Promise<Person[]> {
  return readSnapshot(db, async (tx) => {
    const found = await connections(tx, userId);
    if (found.size === 0) return [];
    const [names, opens] = await Promise.all([
      displayNames(tx, [...found.keys()]),
      opening(tx, userId, found),
    ]);
    return [...found]
      .flatMap(([id, connection]) => personOf(id, names.get(id) ?? null, connection, opens) ?? [])
      .toSorted(
        (a, b) => b.sharedAt.localeCompare(a.sharedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
  });
}

const byName = (a: PersonShare, b: PersonShare) =>
  byBytes(searchKey(a.name), searchKey(b.name)) || byBytes(a.containerId, b.containerId);

const shown = ({ grantId, containerId, name, kind, role, status }: Share): PersonShare[] => {
  const open = openGrantStatuses.find((each) => each === status);
  return open ? [{ grantId, containerId, name, kind, role, status: open }] : [];
};

/**
 * `GET /v1/people/{id}` (FR-07.24, DS-121): one of the person's people and what's shared each way, by name. Theirs are
 * their pending invitations to folders and lists outside Trash, and the accepted ones that open. Undefined for anyone
 * else, as if they didn't exist.
 */
export function personShares(
  db: Database,
  userId: string,
  personId: string,
): Promise<PersonShares | undefined> {
  return readSnapshot(db, async (tx) => {
    const found = await connections(tx, userId, personId);
    const connection = found.get(personId);
    if (!connection) return undefined;
    const [names, opens] = await Promise.all([
      displayNames(tx, [personId]),
      opening(tx, userId, found),
    ]);
    const person = personOf(personId, names.get(personId) ?? null, connection, opens);
    if (!person) return undefined;
    return {
      person,
      yours: connection.yours
        .filter((share) => !share.trashed)
        .flatMap(shown)
        .toSorted(byName),
      theirs: connection.theirs
        .filter((share) =>
          share.status === "pending" ? !share.trashed : opens.has(share.containerId),
        )
        .flatMap(shown)
        .toSorted(byName),
    };
  });
}
