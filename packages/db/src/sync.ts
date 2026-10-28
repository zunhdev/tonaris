// The sync protocol's storage (TS-20–TS-24): running a mutation under the owner's write lock, reading the
// change log after a cursor, and the bootstrap snapshot. Commands come from packages/domain; this module
// gives them a store on the transaction and records what they did.

import {
  and,
  asc,
  count,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  notExists,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  actingUserId,
  appViewDefaults,
  changeSchema,
  outcomeSchema,
  runBatch,
  runCommand,
  syncRetentionMs,
  uuidv7Time,
  failure,
  maxContainerDepth,
  nameKey,
  searchKey,
  type Album,
  type Batch,
  type BatchResult,
  type Bootstrap,
  type CaptureSource,
  type Change,
  type ChangeInput,
  type CollectionStore,
  type Container,
  type CustomField,
  type FieldType,
  type FieldValue,
  type FieldValueData,
  type Membership,
  type Mutation,
  type MutationResult,
  type Outcome,
  type Position,
  type PreparedLink,
  type Principal,
  type ServiceLink,
  type StoredField,
  type ViewDefaults,
  type ViewPrefs,
} from "@tonaris/domain";

import { albumsOfReleaseGroupIn, applyPlan, findCaptureTarget } from "./album-writes";
import type { Database, Transaction } from "./client";
import { recordUserValues, userEntries, writeProvenance } from "./provenance";
import {
  accountSettings,
  accountSync,
  albumFieldMulti,
  albumFieldValues,
  albumServiceLinks,
  fieldDefinitions,
  fieldOptions,
  albums,
  changeLog,
  containers,
  memberships,
  mutations,
  positions,
  trashUnits,
  viewPrefs,
} from "./schema";

const albumColumns = {
  id: albums.id,
  title: albums.title,
  artistCredit: albums.artistCredit,
  releaseType: albums.releaseType,
  isLive: albums.isLive,
  originalYear: albums.originalYear,
  recordingYearStart: albums.recordingYearStart,
  recordingYearEnd: albums.recordingYearEnd,
  artworkUrl: albums.artworkUrl,
};

const containerColumns = {
  id: containers.id,
  kind: containers.kind,
  parentId: containers.parentId,
  name: containers.name,
};

const membershipColumns = {
  listId: memberships.listId,
  albumId: memberships.albumId,
  addedAt: memberships.addedAt,
};

const viewPrefsColumns = {
  viewKey: viewPrefs.viewKey,
  sortMode: viewPrefs.sortMode,
  sortDir: viewPrefs.sortDir,
  grouped: viewPrefs.grouped,
  layout: viewPrefs.layout,
};

const defaultsColumns = {
  listSortMode: accountSettings.listSortMode,
  listSortDir: accountSettings.listSortDir,
  folderSortMode: accountSettings.folderSortMode,
  folderSortDir: accountSettings.folderSortDir,
  grouped: accountSettings.grouped,
  layout: accountSettings.layout,
};

const positionColumns = {
  viewKey: positions.viewKey,
  itemId: positions.itemId,
  key: positions.key,
};

/** An entry of an active list: the album is in Unsorted while it has none (FR-01.9, TS-13). */
function activeEntryOf(tx: Transaction, albumId: typeof albums.id | string) {
  return tx
    .select({ one: sql`1` })
    .from(memberships)
    .innerJoin(containers, eq(containers.id, memberships.listId))
    .where(and(eq(memberships.albumId, albumId), isNull(containers.trashedAt)));
}

/** A field with its owner and its options in order: keys compare bytewise (TS-16). */
async function findFieldIn(tx: Transaction, id: string): Promise<StoredField | undefined> {
  const [row] = await tx
    .select({
      id: fieldDefinitions.id,
      ownerId: fieldDefinitions.ownerId,
      name: fieldDefinitions.name,
      type: fieldDefinitions.type,
    })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, id));
  if (!row) return undefined;
  const options = await tx
    .select({ id: fieldOptions.id, label: fieldOptions.label })
    .from(fieldOptions)
    .where(eq(fieldOptions.fieldId, id))
    .orderBy(sql`${fieldOptions.sortKey} collate "C"`, asc(fieldOptions.id));
  return { ...row, options };
}

/** The account's custom fields, each with its options in order, as clients hold them (FR-03.6). */
async function fieldsOfAccount(tx: Transaction, accountId: string): Promise<CustomField[]> {
  const definitions = await tx
    .select({ id: fieldDefinitions.id, name: fieldDefinitions.name, type: fieldDefinitions.type })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.ownerId, accountId))
    .orderBy(asc(fieldDefinitions.id));
  if (definitions.length === 0) return [];
  const options = await tx
    .select({ id: fieldOptions.id, fieldId: fieldOptions.fieldId, label: fieldOptions.label })
    .from(fieldOptions)
    .where(
      inArray(
        fieldOptions.fieldId,
        definitions.map((definition) => definition.id),
      ),
    )
    .orderBy(sql`${fieldOptions.sortKey} collate "C"`, asc(fieldOptions.id));
  return definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    type: definition.type,
    options: options
      .filter((option) => option.fieldId === definition.id)
      .map(({ id, label }) => ({ id, label })),
  }));
}

/** The columns a value is stored in (TS-11). */
const valueColumns = {
  albumId: albumFieldValues.albumId,
  fieldId: albumFieldValues.fieldId,
  textValue: albumFieldValues.textValue,
  numberValue: albumFieldValues.numberValue,
  dateValue: albumFieldValues.dateValue,
  boolValue: albumFieldValues.boolValue,
  optionId: albumFieldValues.optionId,
};

const emptyValue = {
  textValue: null,
  numberValue: null,
  dateValue: null,
  boolValue: null,
  optionId: null,
};

type ValueRow = typeof emptyValue extends infer T
  ? { [K in keyof T]: K extends "boolValue" ? boolean | null : string | null }
  : never;

/** The column a value of `type` goes in (TS-11); a multiple choice keeps its selections in `album_field_multi`. */
function columnsOf(type: FieldType, value: FieldValueData): Partial<ValueRow> {
  if (value === null || Array.isArray(value)) return {};
  if (type === "yes_no") return typeof value === "boolean" ? { boolValue: value } : {};
  if (typeof value !== "string") return {};
  if (type === "text") return { textValue: value };
  if (type === "number") return { numberValue: value };
  if (type === "date") return { dateValue: value };
  return { optionId: value };
}

/** A stored value as clients hold it: null when applied-empty (FR-03.7). */
function valueOf(row: ValueRow & { type: FieldType }, selected: string[]): FieldValueData {
  const { type } = row;
  if (type === "text") return row.textValue;
  if (type === "number") return row.numberValue;
  if (type === "date") return row.dateValue;
  if (type === "yes_no") return row.boolValue;
  if (type === "single_choice") return row.optionId;
  // A multiple choice keeps its selections in `album_field_multi`.
  return selected.length > 0 ? selected : null;
}

/** Multiple-choice selections, in their options' order (TS-16), for the albums `where` picks. */
function selectionsOf(tx: Transaction, where: SQL | undefined, fieldId?: string) {
  return tx
    .select({
      albumId: albumFieldMulti.albumId,
      fieldId: albumFieldMulti.fieldId,
      optionId: albumFieldMulti.optionId,
    })
    .from(albumFieldMulti)
    .innerJoin(fieldOptions, eq(fieldOptions.id, albumFieldMulti.optionId))
    .where(fieldId === undefined ? where : and(where, eq(albumFieldMulti.fieldId, fieldId)))
    .orderBy(sql`${fieldOptions.sortKey} collate "C"`, asc(fieldOptions.id));
}

/** The fields the account's albums apply, with their values, Trash included (FR-03.7). */
async function valuesOfAccount(tx: Transaction, accountId: string): Promise<FieldValue[]> {
  const rows = await tx
    .select({ ...valueColumns, type: fieldDefinitions.type })
    .from(albumFieldValues)
    .innerJoin(albums, eq(albums.id, albumFieldValues.albumId))
    .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, albumFieldValues.fieldId))
    .where(eq(albums.ownerId, accountId))
    .orderBy(asc(albumFieldValues.albumId), asc(albumFieldValues.fieldId));
  const selections = await selectionsOf(
    tx,
    inArray(
      albumFieldMulti.albumId,
      tx.select({ id: albums.id }).from(albums).where(eq(albums.ownerId, accountId)),
    ),
  );
  return rows.map((row) => ({
    albumId: row.albumId,
    fieldId: row.fieldId,
    value: valueOf(
      row,
      selections
        .filter((each) => each.albumId === row.albumId && each.fieldId === row.fieldId)
        .map((each) => each.optionId),
    ),
  }));
}

/** An entry as clients see it, with `addedAt` as the ISO string the protocol carries. */
const membershipOf = (row: Omit<Membership, "addedAt"> & { addedAt: Date }): Membership => ({
  ...row,
  addedAt: row.addedAt.toISOString(),
});

/**
 * The domain's store on one transaction. Search and name keys are derived here, so every write keeps them
 * (TS-12), and so is the provenance of a person's album values (TS-15). The hierarchy is walked with recursive
 * CTEs (TS-31), cut off past the depth limit so that even a cycle in damaged data can't run away.
 */
function collectionStore(tx: Transaction): CollectionStore {
  return {
    async findAlbum(id) {
      const [row] = await tx
        .select({ ...albumColumns, ownerId: albums.ownerId, trashedAt: albums.trashedAt })
        .from(albums)
        .where(eq(albums.id, id));
      if (!row) return undefined;
      const { trashedAt, ...album } = row;
      return { ...album, trashed: trashedAt !== null };
    },
    async insertAlbum({ ownerId, id, ...values }, origin) {
      await tx.insert(albums).values({
        id,
        ownerId,
        ...values,
        ...(origin ? { mbReleaseGroupId: origin.releaseGroupId } : {}),
        searchTitleKey: searchKey(values.title),
        searchArtistKey: searchKey(values.artistCredit),
      });
      // A new album has no rows to clear.
      await writeProvenance(tx, id, origin ? origin.provenance : userEntries(values));
    },
    async updateAlbum(id, values) {
      await tx
        .update(albums)
        .set({
          ...values,
          ...(values.title === undefined ? {} : { searchTitleKey: searchKey(values.title) }),
          ...(values.artistCredit === undefined
            ? {}
            : { searchArtistKey: searchKey(values.artistCredit) }),
        })
        .where(eq(albums.id, id));
      await recordUserValues(tx, id, values);
    },
    findCaptureTarget: (id) => findCaptureTarget(tx, id),
    albumsOfReleaseGroup: (ownerId, releaseGroupId) =>
      albumsOfReleaseGroupIn(tx, ownerId, releaseGroupId),
    fillAlbum: (id, plan) => applyPlan(tx, id, plan),
    async reactivateAlbum(id) {
      const [album] = await tx
        .select({ trashUnitId: albums.trashUnitId })
        .from(albums)
        .where(eq(albums.id, id));
      await tx.update(albums).set({ trashedAt: null, trashUnitId: null }).where(eq(albums.id, id));
      // An album's own unit holds only it (TS-13), so it goes with the album's return.
      if (album?.trashUnitId) {
        await tx
          .delete(trashUnits)
          .where(
            and(
              eq(trashUnits.id, album.trashUnitId),
              eq(trashUnits.kind, "album"),
              eq(trashUnits.rootId, id),
            ),
          );
      }
      const left = await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.albumId, id),
            exists(
              tx
                .select({ one: sql`1` })
                .from(containers)
                .where(and(eq(containers.id, memberships.listId), isNull(containers.trashedAt))),
            ),
          ),
        )
        .returning({ listId: memberships.listId });
      return left.map((row) => row.listId);
    },
    async findServiceLink(albumId, service) {
      const [row] = await tx
        .select({
          service: albumServiceLinks.service,
          url: albumServiceLinks.url,
          entityId: albumServiceLinks.entityId,
        })
        .from(albumServiceLinks)
        .where(and(eq(albumServiceLinks.albumId, albumId), eq(albumServiceLinks.service, service)));
      return row;
    },
    async insertServiceLink(albumId, ownerId, link) {
      await tx.insert(albumServiceLinks).values({ albumId, ownerId, ...link });
    },
    async saveServiceLink(albumId, ownerId, link) {
      await tx
        .insert(albumServiceLinks)
        .values({ albumId, ownerId, ...link })
        .onConflictDoUpdate({
          target: [albumServiceLinks.albumId, albumServiceLinks.service],
          set: { url: link.url, entityId: link.entityId, updatedAt: sql`now()` },
        });
    },
    async deleteServiceLink(albumId, service) {
      await tx
        .delete(albumServiceLinks)
        .where(and(eq(albumServiceLinks.albumId, albumId), eq(albumServiceLinks.service, service)));
    },

    findField: (id) => findFieldIn(tx, id),
    async fieldsOf(ownerId) {
      const rows = await tx
        .select({ id: fieldDefinitions.id })
        .from(fieldDefinitions)
        .where(eq(fieldDefinitions.ownerId, ownerId))
        .orderBy(asc(fieldDefinitions.id));
      const found = await Promise.all(rows.map((row) => findFieldIn(tx, row.id)));
      return found.flatMap((field) => {
        if (!field) return [];
        const { ownerId: _, ...rest } = field;
        return [rest];
      });
    },
    async insertField({ id, ownerId, name, type }, options) {
      await tx.insert(fieldDefinitions).values({ id, ownerId, name, nameKey: nameKey(name), type });
      if (options.length > 0) {
        await tx.insert(fieldOptions).values(
          options.map((option) => ({
            id: option.id,
            fieldId: id,
            label: option.label,
            labelKey: nameKey(option.label),
            sortKey: option.sortKey,
          })),
        );
      }
    },
    async renameField(id, name) {
      await tx
        .update(fieldDefinitions)
        .set({ name, nameKey: nameKey(name) })
        .where(eq(fieldDefinitions.id, id));
    },

    async findFieldValue(albumId, fieldId) {
      const [row] = await tx
        .select({ ...valueColumns, type: fieldDefinitions.type })
        .from(albumFieldValues)
        .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, albumFieldValues.fieldId))
        .where(and(eq(albumFieldValues.albumId, albumId), eq(albumFieldValues.fieldId, fieldId)));
      if (!row) return undefined;
      const selected =
        row.type === "multiple_choice"
          ? await selectionsOf(tx, eq(albumFieldMulti.albumId, albumId), fieldId)
          : [];
      return valueOf(
        row,
        selected.map((each) => each.optionId),
      );
    },
    async applyField(albumId, fieldId) {
      await tx.insert(albumFieldValues).values({ albumId, fieldId }).onConflictDoNothing();
    },
    async setFieldValue(albumId, field, value) {
      const at = and(eq(albumFieldValues.albumId, albumId), eq(albumFieldValues.fieldId, field.id));
      await tx
        .update(albumFieldValues)
        .set({ ...emptyValue, ...columnsOf(field.type, value) })
        .where(at);
      if (field.type !== "multiple_choice") return;
      await tx
        .delete(albumFieldMulti)
        .where(and(eq(albumFieldMulti.albumId, albumId), eq(albumFieldMulti.fieldId, field.id)));
      if (Array.isArray(value) && value.length > 0) {
        await tx
          .insert(albumFieldMulti)
          .values(value.map((optionId) => ({ albumId, fieldId: field.id, optionId })));
      }
    },
    async removeField(albumId, fieldId) {
      // Its multiple-choice selections cascade (TS-11).
      await tx
        .delete(albumFieldValues)
        .where(and(eq(albumFieldValues.albumId, albumId), eq(albumFieldValues.fieldId, fieldId)));
    },

    async findContainer(id) {
      const [row] = await tx
        .select({
          ...containerColumns,
          ownerId: containers.ownerId,
          trashedAt: containers.trashedAt,
        })
        .from(containers)
        .where(eq(containers.id, id));
      if (!row) return undefined;
      const { trashedAt, ...container } = row;
      return { ...container, trashed: trashedAt !== null };
    },
    async containerPath(id) {
      const rows = await tx.execute<{ id: string }>(sql`
        with recursive path (id, parent_id, level) as (
          select id, parent_id, 1 from ${containers} where id = ${id}
          union all
          select c.id, c.parent_id, path.level + 1
          from ${containers} c join path on c.id = path.parent_id
          where path.level <= ${maxContainerDepth}
        )
        select id from path order by level`);
      return rows.map((row) => row.id);
    },
    async subtreeDepth(id) {
      const [row] = await tx.execute<{ depth: number | null }>(sql`
        with recursive tree (id, level) as (
          select id, 1 from ${containers} where id = ${id} and trashed_at is null
          union all
          select c.id, tree.level + 1
          from ${containers} c join tree on c.parent_id = tree.id
          where c.trashed_at is null and tree.level <= ${maxContainerDepth}
        )
        select max(level)::int as depth from tree`);
      return row?.depth ?? 0;
    },
    activeChildren(ownerId, parentId) {
      return tx
        .select(containerColumns)
        .from(containers)
        .where(
          and(
            eq(containers.ownerId, ownerId),
            parentId === null ? isNull(containers.parentId) : eq(containers.parentId, parentId),
            isNull(containers.trashedAt),
          ),
        );
    },
    async countContainers(ownerId) {
      const [row] = await tx
        .select({ count: count() })
        .from(containers)
        .where(eq(containers.ownerId, ownerId));
      return row?.count ?? 0;
    },
    async insertContainer(container) {
      await tx.insert(containers).values({ ...container, nameKey: nameKey(container.name) });
    },
    async updateContainer(id, values) {
      await tx
        .update(containers)
        .set({
          ...values,
          ...(values.name === undefined ? {} : { nameKey: nameKey(values.name) }),
        })
        .where(eq(containers.id, id));
    },

    async findMembership(listId, albumId) {
      const [row] = await tx
        .select(membershipColumns)
        .from(memberships)
        .where(and(eq(memberships.listId, listId), eq(memberships.albumId, albumId)));
      return row && membershipOf(row);
    },
    async countMemberships(ownerId) {
      const [row] = await tx
        .select({ count: count() })
        .from(memberships)
        .where(eq(memberships.ownerId, ownerId));
      return row?.count ?? 0;
    },
    async insertMembership({ addedAt, ...membership }) {
      await tx.insert(memberships).values({ ...membership, addedAt: new Date(addedAt) });
    },
    async deleteMembership(listId, albumId) {
      await tx
        .delete(memberships)
        .where(and(eq(memberships.listId, listId), eq(memberships.albumId, albumId)));
    },

    async findViewPrefs(personId, viewKey) {
      const [row] = await tx
        .select(viewPrefsColumns)
        .from(viewPrefs)
        .where(and(eq(viewPrefs.personId, personId), eq(viewPrefs.viewKey, viewKey)));
      return row;
    },
    async saveViewPrefs(personId, { viewKey, ...choices }) {
      await tx
        .insert(viewPrefs)
        .values({ personId, viewKey, ...choices })
        .onConflictDoUpdate({ target: [viewPrefs.personId, viewPrefs.viewKey], set: choices });
    },
    async deleteViewPrefs(personId, viewKey) {
      await tx
        .delete(viewPrefs)
        .where(and(eq(viewPrefs.personId, personId), eq(viewPrefs.viewKey, viewKey)));
    },
    async findDefaults(personId) {
      const [row] = await tx
        .select(defaultsColumns)
        .from(accountSettings)
        .where(eq(accountSettings.accountId, personId));
      return row;
    },
    async saveDefaults(personId, defaults) {
      await tx
        .insert(accountSettings)
        .values({ accountId: personId, ...defaults })
        .onConflictDoUpdate({ target: accountSettings.accountId, set: defaults });
    },

    async findPositions(personId, viewKey, itemIds) {
      if (itemIds.length === 0) return new Map();
      const rows = await tx
        .select({ itemId: positions.itemId, key: positions.key })
        .from(positions)
        .where(
          and(
            eq(positions.personId, personId),
            eq(positions.viewKey, viewKey),
            inArray(positions.itemId, [...itemIds]),
          ),
        );
      return new Map(rows.map((row) => [row.itemId, row.key]));
    },
    async savePosition(personId, { viewKey, itemId, key }) {
      await tx
        .insert(positions)
        .values({ personId, viewKey, itemId, key })
        .onConflictDoUpdate({
          target: [positions.personId, positions.viewKey, positions.itemId],
          set: { key },
        });
    },
    async deletePosition(personId, viewKey, itemId) {
      const deleted = await tx
        .delete(positions)
        .where(
          and(
            eq(positions.personId, personId),
            eq(positions.viewKey, viewKey),
            eq(positions.itemId, itemId),
          ),
        )
        .returning({ itemId: positions.itemId });
      return deleted.length > 0;
    },
    async firstKey(personId, viewKey) {
      // Keys compare bytewise, never by the database's locale (TS-16).
      const [row] = await tx
        .select({ key: positions.key })
        .from(positions)
        .where(and(eq(positions.personId, personId), eq(positions.viewKey, viewKey)))
        .orderBy(sql`${positions.key} collate "C"`)
        .limit(1);
      return row?.key;
    },
    async viewItems(personId, viewKey, kind) {
      let rows: { id: string }[];
      if (kind === "containers") {
        rows = await tx
          .select({ id: containers.id })
          .from(containers)
          .where(
            and(
              eq(containers.ownerId, personId),
              viewKey === "root" ? isNull(containers.parentId) : eq(containers.parentId, viewKey),
              isNull(containers.trashedAt),
            ),
          );
      } else if (viewKey === "unsorted") {
        rows = await tx
          .select({ id: albums.id })
          .from(albums)
          .where(
            and(
              eq(albums.ownerId, personId),
              isNull(albums.trashedAt),
              notExists(activeEntryOf(tx, albums.id)),
            ),
          );
      } else {
        rows = await tx
          .select({ id: memberships.albumId })
          .from(memberships)
          .innerJoin(albums, eq(albums.id, memberships.albumId))
          .where(and(eq(memberships.listId, viewKey), isNull(albums.trashedAt)));
      }
      return new Set(rows.map((row) => row.id));
    },
    async inActiveList(albumId) {
      return (await activeEntryOf(tx, albumId).limit(1)).length > 0;
    },
  };
}

/**
 * Takes the account's write lock (TS-20): its `account_sync` row, for the rest of the transaction. Every write of
 * the account waits here, so commit order is `seq` order. Answers the account's `seq` before this write.
 */
export async function lockAccount(tx: Transaction, accountId: string): Promise<number> {
  await tx.insert(accountSync).values({ accountId }).onConflictDoNothing();
  const [lock] = await tx
    .select({ seq: accountSync.seq })
    .from(accountSync)
    .where(eq(accountSync.accountId, accountId))
    .for("update");
  return lock?.seq ?? 0;
}

/**
 * Logs `inputs` at the `seq`s after `seq`, one each, and advances the account's `seq` past them, under the lock
 * `lockAccount` took. `mutationId` is the mutation that made them, or null for the system's own writes, such as
 * enrichment. Answers the changes as the stream carries them.
 */
export async function logChanges(
  tx: Transaction,
  accountId: string,
  seq: number,
  inputs: readonly ChangeInput[],
  mutationId: string | null,
): Promise<Change[]> {
  const changes = inputs.map((change, index) =>
    Object.assign({ seq: seq + index + 1, mutationId }, change),
  );
  await tx
    .update(accountSync)
    .set({ seq: seq + changes.length })
    .where(eq(accountSync.accountId, accountId));
  await tx.insert(changeLog).values(
    changes.map((change) => ({
      accountId,
      seq: change.seq,
      entity: change.entity,
      entityId: change.id,
      op: change.op,
      data: change.data,
      mutationId,
    })),
  );
  return changes;
}

/** How the `mutations` table names who sent a mutation (TS-11). */
function principalLabel(principal: Principal): string {
  if (principal.kind === "mcp") return `mcp:${principal.grantId}`;
  if (principal.kind === "guest") return `guest:${principal.linkId}`;
  return `user:${principal.client}`;
}

export type ExecutedMutation = {
  result: MutationResult;
  /** The changes it committed, in `seq` order, for the stream. Empty for rejections and replays. */
  changes: Change[];
  /** Whether the outcome is the stored one of an earlier copy of this mutation (TS-22). */
  replayed: boolean;
};

/**
 * Runs one mutation for the account `principal` acts for (TS-20 steps 2–5), in one transaction:
 *
 * 1. Lock the account's `account_sync` row. Every write of the account waits here, so commit order is `seq`
 *    order, and a copy of a mutation that is still running waits for it and then finds its outcome.
 * 2. Replay a stored outcome for a known `mutationId`; refuse one too old to have a record any more (`expired`).
 * 3. Run the command. If it applied changes, advance `seq` by one per change and log each change at its `seq`,
 *    so the log has no gaps and a rejection or replay uses no `seq`.
 * 4. Record the outcome under `mutationId`, whatever it is, so every retry gets the same answer (FR-13.5).
 *
 * A mutation `claimMutation()` claimed, such as a capture whose providers ran outside the lock, passes `claimed`, and
 * its claim's row takes the outcome. `capture` is what the API found for an `album.capture`, and `link` how it read a
 * `link.set`'s URL.
 */
export async function executeMutation(
  db: Database,
  principal: Principal,
  mutation: Mutation,
  now: Date = new Date(),
  {
    claimed = false,
    capture,
    link,
  }: { claimed?: boolean; capture?: CaptureSource; link?: PreparedLink } = {},
): Promise<ExecutedMutation> {
  const accountId = actingUserId(principal);
  const { mutationId } = mutation;
  const answer = (outcome: Outcome, changes: Change[] = [], replayed = false) => ({
    result: { mutationId, outcome },
    changes,
    replayed,
  });
  if (!accountId) return answer(failure("permission_denied", "Guests can't change anything."));

  return db.transaction(async (tx) => {
    const seq = await lockAccount(tx, accountId);

    const [stored] = await tx
      .select({ accountId: mutations.accountId, result: mutations.result })
      .from(mutations)
      .where(eq(mutations.id, mutationId));
    if (stored?.result && stored.accountId === accountId) {
      return answer(outcomeSchema.parse(stored.result), [], true);
    }
    if (stored && (stored.accountId !== accountId || !claimed)) return answer(idInUse);
    const madeAt = uuidv7Time(mutationId) ?? now.getTime();
    if (madeAt < now.getTime() - syncRetentionMs) {
      return answer(
        failure(
          "expired",
          "This change is too old to be retried. Check the saved state and make it again.",
        ),
      );
    }

    const result = await runCommand(mutation, {
      principal,
      store: collectionStore(tx),
      now,
      ...(capture ? { capture } : {}),
      ...(link ? { link } : {}),
    });
    let changes: Change[] = [];
    const reported = result.status === "applied" ? (result.result ?? null) : null;
    let outcome: Outcome =
      result.status === "applied" ? { status: "confirmed", seq, result: reported } : result;
    if (result.status === "applied" && result.changes.length > 0) {
      changes = await logChanges(tx, accountId, seq, result.changes, mutationId);
      outcome = { status: "confirmed", seq: seq + changes.length, result: reported };
    }

    await recordOutcome(tx, accountId, principal, mutation, outcome, now);
    return answer(outcome, changes);
  });
}

const idInUse = failure("validation_failed", "This mutation ID is already in use.", [
  { path: "mutationId", message: "Already in use" },
]);

/** Stores `outcome` under the mutation's ID, completing its claim if it has one. */
async function recordOutcome(
  tx: Transaction,
  accountId: string,
  principal: Principal,
  mutation: Mutation,
  outcome: Outcome,
  receivedAt: Date,
): Promise<void> {
  const completedAt = new Date();
  await tx
    .insert(mutations)
    .values({
      id: mutation.mutationId,
      accountId,
      principal: principalLabel(principal),
      name: mutation.name,
      status: outcome.status,
      result: outcome,
      receivedAt,
      completedAt,
    })
    .onConflictDoUpdate({
      target: mutations.id,
      set: { status: outcome.status, result: outcome, completedAt },
      setWhere: isNull(mutations.result),
    });
}

/** How long a claim holds before it counts as abandoned, and the mutation runs again (TS-22). */
export const claimTimeoutMs = 5 * 60_000;

/** What `claimMutation()` found: run it now, it is running elsewhere, or it is already answered. */
export type Claim =
  | { status: "claimed" }
  | { status: "in_progress" }
  | { status: "answered"; executed: ExecutedMutation };

/**
 * Claims a mutation that waits on providers before taking the write lock, such as a capture (TS-22): a stored outcome
 * is replayed, a claim made under `claimTimeoutMs` ago is in progress, and otherwise a row with no outcome is
 * recorded, or an abandoned one refreshed. The claimer then finishes it with `executeMutation(…, { claimed })` or
 * `finishMutation()`. Refusals that need no providers, such as an expired retry, are answered here.
 */
export async function claimMutation(
  db: Database,
  principal: Principal,
  mutation: Mutation,
  now: Date = new Date(),
): Promise<Claim> {
  const accountId = actingUserId(principal);
  const { mutationId } = mutation;
  const answered = (outcome: Outcome, replayed = false): Claim => ({
    status: "answered",
    executed: { result: { mutationId, outcome }, changes: [], replayed },
  });
  if (!accountId) return answered(failure("permission_denied", "Guests can't change anything."));

  return db.transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const [stored] = await tx
      .select({
        accountId: mutations.accountId,
        result: mutations.result,
        receivedAt: mutations.receivedAt,
      })
      .from(mutations)
      .where(eq(mutations.id, mutationId));
    if (stored) {
      if (stored.accountId !== accountId) return answered(idInUse);
      if (stored.result) return answered(outcomeSchema.parse(stored.result), true);
      if (stored.receivedAt.getTime() > now.getTime() - claimTimeoutMs) {
        return { status: "in_progress" };
      }
      await tx.update(mutations).set({ receivedAt: now }).where(eq(mutations.id, mutationId));
      return { status: "claimed" };
    }
    const madeAt = uuidv7Time(mutationId) ?? now.getTime();
    if (madeAt < now.getTime() - syncRetentionMs) {
      return answered(
        failure(
          "expired",
          "This change is too old to be retried. Check the saved state and make it again.",
        ),
      );
    }
    await tx.insert(mutations).values({
      id: mutationId,
      accountId,
      principal: principalLabel(principal),
      name: mutation.name,
      status: "running",
      result: null,
      receivedAt: now,
    });
    return { status: "claimed" };
  });
}

/** Stores the outcome of a claimed mutation decided before the lock, such as a link that needs details. */
export async function finishMutation(
  db: Database,
  principal: Principal,
  mutation: Mutation,
  outcome: Outcome,
  now: Date = new Date(),
): Promise<ExecutedMutation> {
  const accountId = actingUserId(principal);
  if (accountId) {
    await db.transaction((tx) => recordOutcome(tx, accountId, principal, mutation, outcome, now));
  }
  return { result: { mutationId: mutation.mutationId, outcome }, changes: [], replayed: false };
}

/** Gives a claim up without an outcome, after an unexpected failure, so sending the mutation again runs it. */
export async function releaseClaim(
  db: Database,
  principal: Principal,
  mutationId: string,
): Promise<void> {
  const accountId = actingUserId(principal);
  if (!accountId) return;
  await db
    .delete(mutations)
    .where(
      and(
        eq(mutations.id, mutationId),
        eq(mutations.accountId, accountId),
        isNull(mutations.result),
      ),
    );
}

/** Whether the account's mutation is claimed and still running, for `GET /v1/mutations/{id}` (TS-22). */
export async function mutationRunning(
  db: Database,
  accountId: string,
  mutationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select({ receivedAt: mutations.receivedAt })
    .from(mutations)
    .where(
      and(
        eq(mutations.id, mutationId),
        eq(mutations.accountId, accountId),
        isNull(mutations.result),
      ),
    );
  return row !== undefined && row.receivedAt.getTime() > now.getTime() - claimTimeoutMs;
}

/**
 * Runs a batch's items in order (TS-25), each as its own `executeMutation`: its own transaction, under the
 * owner's write lock, so a success stays committed whatever happens to later items. `onExecuted` gets each item's
 * changes as soon as it commits, for the stream. Each item takes the time it runs at, unless `now` is given.
 * `execute` replaces `executeMutation` per item, as the API's does to run captures with their providers.
 */
export function executeBatch(
  db: Database,
  principal: Principal,
  batch: Batch,
  {
    now,
    onExecuted = () => {},
    execute = (mutation) => executeMutation(db, principal, mutation, now),
  }: {
    now?: Date;
    onExecuted?: (changes: Change[]) => void;
    /** Runs one item; the API's runs captures with their providers first. */
    execute?: (mutation: Mutation) => Promise<ExecutedMutation>;
  } = {},
): Promise<BatchResult> {
  return runBatch(batch, async (mutation) => {
    const { result, changes } = await execute(mutation);
    onExecuted(changes);
    return result.outcome;
  });
}

/** A mutation's stored result, for the account that sent it (`GET /v1/mutations/{id}`, TS-22). */
export async function findMutationResult(
  db: Database,
  accountId: string,
  mutationId: string,
): Promise<MutationResult | undefined> {
  const [stored] = await db
    .select({ result: mutations.result })
    .from(mutations)
    .where(and(eq(mutations.id, mutationId), eq(mutations.accountId, accountId)));
  return stored?.result ? { mutationId, outcome: outcomeSchema.parse(stored.result) } : undefined;
}

/** The account's latest `seq`: 0 before its first change. */
export async function headSeq(db: Database, accountId: string): Promise<number> {
  const [row] = await db
    .select({ seq: accountSync.seq })
    .from(accountSync)
    .where(eq(accountSync.accountId, accountId));
  return row?.seq ?? 0;
}

/** Up to `limit` of the account's changes after `seq`, in order (TS-23). */
export async function readChanges(
  db: Database,
  accountId: string,
  after: number,
  limit: number,
): Promise<Change[]> {
  const rows = await db
    .select({
      seq: changeLog.seq,
      entity: changeLog.entity,
      id: changeLog.entityId,
      op: changeLog.op,
      data: changeLog.data,
      mutationId: changeLog.mutationId,
    })
    .from(changeLog)
    .where(and(eq(changeLog.accountId, accountId), gt(changeLog.seq, after)))
    .orderBy(asc(changeLog.seq))
    .limit(limit);
  // The log holds what executeMutation wrote; reading it back through the schema keeps the stream honest.
  return rows.map((row) => changeSchema.parse(row));
}

/**
 * The account's collection, its view choices, manual order and defaults, and the `seq` they are current at (TS-24),
 * from one snapshot: a write commits its records and its `seq` together, so the snapshot sees both or neither.
 * Trashed records come too, marked by nothing yet: Trash arrives with M5, and its views filter them.
 */
export function bootstrapSnapshot(db: Database, accountId: string): Promise<Bootstrap> {
  return db.transaction(
    async (tx) => {
      const [sync] = await tx
        .select({ seq: accountSync.seq })
        .from(accountSync)
        .where(eq(accountSync.accountId, accountId));
      const owned: Album[] = await tx
        .select(albumColumns)
        .from(albums)
        .where(eq(albums.ownerId, accountId))
        .orderBy(asc(albums.id));
      const folders: Container[] = await tx
        .select(containerColumns)
        .from(containers)
        .where(eq(containers.ownerId, accountId))
        .orderBy(asc(containers.id));
      const entries = await tx
        .select(membershipColumns)
        .from(memberships)
        .where(eq(memberships.ownerId, accountId))
        .orderBy(asc(memberships.listId), asc(memberships.albumId));
      const fields = await fieldsOfAccount(tx, accountId);
      const fieldValues = await valuesOfAccount(tx, accountId);
      const links: ServiceLink[] = await tx
        .select({
          albumId: albumServiceLinks.albumId,
          service: albumServiceLinks.service,
          url: albumServiceLinks.url,
        })
        .from(albumServiceLinks)
        .where(eq(albumServiceLinks.ownerId, accountId))
        .orderBy(asc(albumServiceLinks.albumId), asc(albumServiceLinks.service));
      const views: ViewPrefs[] = await tx
        .select(viewPrefsColumns)
        .from(viewPrefs)
        .where(eq(viewPrefs.personId, accountId))
        .orderBy(asc(viewPrefs.viewKey));
      const arranged: Position[] = await tx
        .select(positionColumns)
        .from(positions)
        .where(eq(positions.personId, accountId))
        .orderBy(asc(positions.viewKey), asc(positions.itemId));
      const [defaults]: ViewDefaults[] = await tx
        .select(defaultsColumns)
        .from(accountSettings)
        .where(eq(accountSettings.accountId, accountId));
      return {
        seq: sync?.seq ?? 0,
        albums: owned,
        containers: folders,
        memberships: entries.map(membershipOf),
        links,
        fields,
        fieldValues,
        views,
        positions: arranged,
        defaults: defaults ?? appViewDefaults,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Removes change-log entries and idempotency records older than the retention window (TS-22, TS-23). A stream
 * cursor before the remaining log is then answered with `reset`, and a replay of a removed mutation is `expired`.
 * The daily schedule runs it in its own transaction (TS-91).
 */
export async function pruneSyncHistory(
  db: Database | Transaction,
  now: Date = new Date(),
): Promise<void> {
  const before = new Date(now.getTime() - syncRetentionMs);
  await db.delete(changeLog).where(lt(changeLog.createdAt, before));
  await db.delete(mutations).where(lt(mutations.receivedAt, before));
}
