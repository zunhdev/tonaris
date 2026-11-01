// An in-memory `CollectionStore` for the command tests: the same contract the database layer implements on the
// owner's write transaction (packages/db/src/sync.ts). Import from tests only.

import { generateNKeysBetween } from "fractional-indexing";

import type { Album, StoredAlbum } from "./albums";
import type { CapturedLink, CaptureTarget } from "./capture";
import type { CollectionStore, ShareGrant } from "./collection-store";
import { containerOf, type Container, type StoredContainer } from "./containers";
import { enrichableFields, type EnrichableField, type ProvenanceEntry } from "./enrichment";
import { fieldValueKey, type FieldValue, type FieldValueData } from "./field-values";
import type { StoredField } from "./fields";
import { streamingServices } from "./links";
import { membershipKey, type Membership } from "./memberships";
import { positionKey, type Position } from "./positions";
import { readableContainers, type EmailStatus, type SharingState } from "./sharing";
import type { StoredTrashUnit } from "./trash";
import type { AccountDefaults, ViewDefaults, ViewPrefs } from "./views";

/** The entries of `values` that are set: an update leaves undefined fields as they are. */
const defined = (values: object) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

type StoredMembership = Membership & { ownerId: string };

/** A view preference's key in `memoryStore`: the person's ID and the view key, joined by a colon. */
export const viewRowKey = (personId: string, viewKey: string) => `${personId}:${viewKey}`;

/** A position's key in `memoryStore`: the person's ID, the view key and the item's ID, joined by colons. */
export const positionRowKey = (personId: string, viewKey: string, itemId: string) =>
  `${personId}:${positionKey(viewKey, itemId)}`;

/** What a person's write records: `user` for each value it gives (TS-15). */
const userProvenance = (values: Partial<Record<EnrichableField, unknown>>): ProvenanceEntry[] =>
  enrichableFields
    .filter((field) => values[field] !== undefined && values[field] !== null)
    .map((field) => ({ field, source: "user", sourceRef: null, retrievedAt: null }));

/**
 * A store over plain maps, which tests inspect directly. Albums are active unless they say otherwise; entries are
 * keyed by `membershipKey`, view preferences by `viewRowKey`, positions by `positionRowKey`, and defaults by the
 * person's ID.
 */
export function memoryStore({
  albums = [],
  links = [],
  fields = [],
  fieldValues = [],
  containers = [],
  memberships = [],
  views = [],
  defaults = [],
  positions = [],
  accounts = [],
}: {
  /** Albums; one without `artworkUrl` has none. */
  albums?: (Omit<Album, "artworkUrl"> & {
    ownerId: string;
    trashed?: boolean;
    releaseGroupId?: string | null;
    artworkUrl?: string | null;
  })[];
  links?: (CapturedLink & { albumId: string })[];
  /** Custom fields, with their owners and options in order. */
  fields?: StoredField[];
  /** Fields applied to albums, with their values. */
  fieldValues?: FieldValue[];
  /** Folders and lists; one without `description` has none. */
  containers?: (Omit<StoredContainer, "description"> & { description?: string | null })[];
  memberships?: StoredMembership[];
  views?: (ViewPrefs & { personId: string })[];
  defaults?: (ViewDefaults &
    Partial<Pick<AccountDefaults, "linkTarget" | "hiddenServices">> & { personId: string })[];
  positions?: (Position & { personId: string })[];
  /** Accounts, by email key, for invitations and display names. */
  accounts?: { id: string; email: string; displayName?: string | null }[];
} = {}) {
  const albumRows = new Map<string, StoredAlbum>(
    albums.map((row) => {
      const { releaseGroupId: _, artworkUrl = null, ...album } = row;
      return [album.id, { trashed: false, ...album, artworkUrl }];
    }),
  );
  /** Each album's release group, which clients' records don't carry. */
  const identityRows = new Map(
    albums.map((album) => [album.id, { releaseGroupId: album.releaseGroupId ?? null }]),
  );
  /** Each album's provenance, by field (TS-15). */
  const provenanceRows = new Map<string, Map<EnrichableField, ProvenanceEntry>>();
  const linkRows = new Map(
    links.map(({ albumId, ...link }) => [`${albumId}:${link.service}`, link]),
  );
  const recordProvenance = (albumId: string, entries: readonly ProvenanceEntry[]) => {
    const row = provenanceRows.get(albumId) ?? new Map<EnrichableField, ProvenanceEntry>();
    for (const entry of entries) row.set(entry.field, entry);
    provenanceRows.set(albumId, row);
  };
  const captureTarget = (id: string): CaptureTarget | undefined => {
    const album = albumRows.get(id);
    const identity = identityRows.get(id) ?? { releaseGroupId: null };
    return album && { ...album, ...identity };
  };
  const fieldRows = new Map<string, StoredField>(
    fields.map((field) => [field.id, { ...field, options: [...field.options] }]),
  );
  /** Each option's fractional-index key (TS-16). */
  const optionKeys = new Map<string, string>(
    fields.flatMap((field) => {
      const keys = generateNKeysBetween(null, null, field.options.length);
      return field.options.map((option, index): [string, string] => [option.id, keys[index] ?? ""]);
    }),
  );
  /** Each album's applied fields and values, by `fieldValueKey`. */
  const valueRows = new Map<string, FieldValueData>(
    fieldValues.map((row) => [fieldValueKey(row.albumId, row.fieldId), row.value]),
  );
  const containerRows = new Map<string, StoredContainer>(
    containers.map((container) => [container.id, { description: null, ...container }]),
  );
  /** Trash units by ID, and the unit each trashed folder or list is in (TS-13). */
  const unitRows = new Map<string, StoredTrashUnit>();
  const unitOf = new Map<string, string>();
  const membershipRows = new Map(
    memberships.map((entry) => [membershipKey(entry.listId, entry.albumId), { ...entry }]),
  );
  const viewRows = new Map<string, ViewPrefs>(
    views.map(({ personId, ...prefs }) => [viewRowKey(personId, prefs.viewKey), prefs]),
  );
  const defaultRows = new Map<string, AccountDefaults>(
    defaults.map(({ personId, ...values }) => [
      personId,
      { linkTarget: "web", hiddenServices: [], ...values },
    ]),
  );
  const positionRows = new Map<string, Position & { personId: string }>(
    positions.map((row) => [positionRowKey(row.personId, row.viewKey, row.itemId), { ...row }]),
  );
  const accountRows = new Map(
    accounts.map(({ displayName = null, ...account }) => [account.id, { ...account, displayName }]),
  );
  type GrantRow = ShareGrant & {
    containerId: string;
    granteeId: string;
    invitedEmail: string;
    emailStatus: EmailStatus | null;
  };
  /** Saved references, by viewer and container (TS-33). */
  const referenceRows = new Map<
    string,
    { viewerId: string; containerId: string; linkId: string | null }
  >();
  const grantRows = new Map<string, GrantRow>();
  const shareLinkRows = new Map<
    string,
    { id: string; containerId: string; tokenHash: Uint8Array; revokedAt: Date | null }
  >();
  const ownedBy = (ownerId: string, containerId: string) =>
    containerRows.get(containerId)?.ownerId === ownerId;
  const inActiveList = (albumId: string) =>
    [...membershipRows.values()].some(
      (entry) => entry.albumId === albumId && containerRows.get(entry.listId)?.trashed === false,
    );

  const activeChildren = (ownerId: string, parentId: string | null): StoredContainer[] =>
    [...containerRows.values()].filter(
      (row) => row.ownerId === ownerId && row.parentId === parentId && !row.trashed,
    );
  const depthBelow = (row: StoredContainer): number =>
    1 + Math.max(0, ...activeChildren(row.ownerId, row.id).map(depthBelow));

  const store: CollectionStore = {
    findAlbum: (id) => Promise.resolve(albumRows.has(id) ? { ...albumRows.get(id)! } : undefined),
    insertAlbum: (album, origin) => {
      albumRows.set(album.id, { ...album, trashed: false });
      identityRows.set(album.id, { releaseGroupId: origin?.releaseGroupId ?? null });
      recordProvenance(album.id, origin ? origin.provenance : userProvenance(album));
      return Promise.resolve();
    },
    updateAlbum: (id, values) => {
      albumRows.set(id, { ...albumRows.get(id)!, ...defined(values) });
      recordProvenance(id, userProvenance(values));
      return Promise.resolve();
    },
    findCaptureTarget: (id) => Promise.resolve(captureTarget(id)),
    albumsOfReleaseGroup: (ownerId, releaseGroupId) =>
      Promise.resolve(
        [...albumRows.keys()]
          .flatMap((id) => captureTarget(id) ?? [])
          .filter((album) => album.ownerId === ownerId && album.releaseGroupId === releaseGroupId)
          .toSorted((a, b) =>
            a.trashed === b.trashed ? (a.id < b.id ? -1 : 1) : a.trashed ? 1 : -1,
          ),
      ),
    fillAlbum: (id, { values, releaseGroupId, provenance }) => {
      albumRows.set(id, { ...albumRows.get(id)!, ...defined(values) });
      const identity = identityRows.get(id) ?? { releaseGroupId: null };
      identityRows.set(id, {
        releaseGroupId: releaseGroupId === undefined ? identity.releaseGroupId : releaseGroupId,
      });
      recordProvenance(id, provenance);
      return Promise.resolve();
    },
    countAlbums: (ownerId) =>
      Promise.resolve([...albumRows.values()].filter((album) => album.ownerId === ownerId).length),
    reactivateAlbum: (id) => {
      albumRows.set(id, { ...albumRows.get(id)!, trashed: false });
      const left = [...membershipRows.values()].filter(
        (entry) => entry.albumId === id && containerRows.get(entry.listId)?.trashed === false,
      );
      for (const entry of left) membershipRows.delete(membershipKey(entry.listId, id));
      const unitId = unitOf.get(id) ?? null;
      if (unitId) unitRows.delete(unitId);
      unitOf.delete(id);
      return Promise.resolve({ left: left.map((entry) => entry.listId), unitId });
    },
    entriesOfAlbum: (albumId) =>
      Promise.resolve(
        [...membershipRows.values()]
          .filter((entry) => entry.albumId === albumId)
          .map(({ listId, albumId: id, addedAt }) => ({ listId, albumId: id, addedAt })),
      ),
    trashAlbum: (unit, albumId) => {
      unitRows.set(unit.id, { ...unit });
      albumRows.set(albumId, { ...albumRows.get(albumId)!, trashed: true });
      unitOf.set(albumId, unit.id);
      return Promise.resolve();
    },
    albumUnit: (albumId) =>
      Promise.resolve(albumRows.get(albumId)?.trashed ? unitOf.get(albumId) : undefined),
    unitsReferencingAlbum: (albumId) =>
      Promise.resolve([
        ...new Set(
          [...membershipRows.values()].flatMap((entry) => {
            const unit = entry.albumId === albumId ? unitOf.get(entry.listId) : undefined;
            return unit ? [unit] : [];
          }),
        ),
      ]),
    addTombstone: (unitId, tombstone) => {
      unitRows.get(unitId)?.tombstones.push(tombstone);
      return Promise.resolve();
    },
    purgeContainers: (unitId, ids) => {
      for (const id of ids) {
        containerRows.delete(id);
        unitOf.delete(id);
        for (const [key, entry] of membershipRows)
          if (entry.listId === id) membershipRows.delete(key);
      }
      unitRows.delete(unitId);
      return Promise.resolve();
    },
    purgeAlbum: (unitId, albumId) => {
      albumRows.delete(albumId);
      unitOf.delete(albumId);
      unitRows.delete(unitId);
      for (const [key, entry] of membershipRows)
        if (entry.albumId === albumId) membershipRows.delete(key);
      const services = [...linkRows.keys()]
        .filter((key) => key.startsWith(`${albumId}:`))
        .map((key) => key.slice(albumId.length + 1));
      for (const service of services) linkRows.delete(`${albumId}:${service}`);
      const fieldIds = [...valueRows.keys()]
        .filter((key) => key.startsWith(`${albumId}:`))
        .map((key) => key.slice(albumId.length + 1));
      for (const fieldId of fieldIds) valueRows.delete(`${albumId}:${fieldId}`);
      for (const [key, position] of positionRows)
        if (position.itemId === albumId) positionRows.delete(key);
      return Promise.resolve({
        services: streamingServices.filter((service) => services.includes(service)),
        fieldIds,
      });
    },
    recoverAlbum: (unitId, albumId) => {
      albumRows.set(albumId, { ...albumRows.get(albumId)!, trashed: false });
      unitOf.delete(albumId);
      unitRows.delete(unitId);
      return Promise.resolve();
    },
    findServiceLink: (albumId, service) => {
      const link = linkRows.get(`${albumId}:${service}`);
      return Promise.resolve(link && { ...link });
    },
    insertServiceLink: (albumId, _ownerId, link) => {
      linkRows.set(`${albumId}:${link.service}`, { ...link });
      return Promise.resolve();
    },
    saveServiceLink: (albumId, _ownerId, link) => {
      linkRows.set(`${albumId}:${link.service}`, { ...link });
      return Promise.resolve();
    },
    deleteServiceLink: (albumId, service) => {
      linkRows.delete(`${albumId}:${service}`);
      return Promise.resolve();
    },

    findField: (id) => {
      const field = fieldRows.get(id);
      return Promise.resolve(field && { ...field, options: [...field.options] });
    },
    fieldsOf: (ownerId) =>
      Promise.resolve(
        [...fieldRows.values()]
          .filter((field) => field.ownerId === ownerId)
          .map((field) => ({
            id: field.id,
            name: field.name,
            type: field.type,
            options: [...field.options],
          })),
      ),
    insertField: (field, options) => {
      for (const option of options) optionKeys.set(option.id, option.sortKey);
      const ordered = options.toSorted((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
      fieldRows.set(field.id, {
        ...field,
        options: ordered.map(({ id, label }) => ({ id, label })),
      });
      return Promise.resolve();
    },
    renameField: (id, name) => {
      fieldRows.set(id, { ...fieldRows.get(id)!, name });
      return Promise.resolve();
    },
    findFieldValue: (albumId, fieldId) => {
      const key = fieldValueKey(albumId, fieldId);
      return Promise.resolve(valueRows.has(key) ? (valueRows.get(key) ?? null) : undefined);
    },
    applyField: (albumId, fieldId) => {
      valueRows.set(fieldValueKey(albumId, fieldId), null);
      return Promise.resolve();
    },
    setFieldValue: (albumId, field, value) => {
      valueRows.set(fieldValueKey(albumId, field.id), value);
      return Promise.resolve();
    },
    removeField: (albumId, fieldId) => {
      valueRows.delete(fieldValueKey(albumId, fieldId));
      return Promise.resolve();
    },
    fieldUsers: (fieldId) =>
      Promise.resolve(
        [...valueRows.keys()].flatMap((key) => {
          const [albumId = "", ofField] = key.split(":");
          if (ofField !== fieldId) return [];
          return [{ id: albumId, trashed: albumRows.get(albumId)?.trashed ?? false }];
        }),
      ),
    deleteField: (fieldId) => {
      for (const option of fieldRows.get(fieldId)?.options ?? []) optionKeys.delete(option.id);
      fieldRows.delete(fieldId);
      for (const key of valueRows.keys()) {
        if (key.endsWith(`:${fieldId}`)) valueRows.delete(key);
      }
      return Promise.resolve();
    },
    fieldUsage: (fieldId) => {
      const usage = { active: 0, trashed: 0 };
      for (const key of valueRows.keys()) {
        const [albumId, ofField] = key.split(":");
        if (ofField !== fieldId) continue;
        if (albumRows.get(albumId ?? "")?.trashed) usage.trashed += 1;
        else usage.active += 1;
      }
      return Promise.resolve(usage);
    },
    optionUsers: (fieldId, optionId) =>
      Promise.resolve(
        [...valueRows.entries()].flatMap(([key, value]) => {
          const [albumId = "", ofField] = key.split(":");
          const chosen = Array.isArray(value) ? value.includes(optionId) : value === optionId;
          if (ofField !== fieldId || !chosen) return [];
          return [{ id: albumId, trashed: albumRows.get(albumId)?.trashed ?? false }];
        }),
      ),
    optionField: (optionId) =>
      Promise.resolve(
        [...fieldRows.values()].find((field) => field.options.some((o) => o.id === optionId))?.id,
      ),
    lastOptionKey: (fieldId) => {
      const keys = (fieldRows.get(fieldId)?.options ?? []).map((o) => optionKeys.get(o.id) ?? "");
      return Promise.resolve(keys.toSorted().at(-1) ?? null);
    },
    changeFieldType: (fieldId, type, discardOptions) => {
      const field = fieldRows.get(fieldId)!;
      fieldRows.set(fieldId, { ...field, type, options: discardOptions ? [] : field.options });
      return Promise.resolve();
    },
    insertFieldOption: (fieldId, { id, label, sortKey }) => {
      const field = fieldRows.get(fieldId)!;
      optionKeys.set(id, sortKey);
      const options = [...field.options, { id, label }].toSorted((a, b) =>
        (optionKeys.get(a.id) ?? "") < (optionKeys.get(b.id) ?? "") ? -1 : 1,
      );
      fieldRows.set(fieldId, { ...field, options });
      return Promise.resolve();
    },
    renameFieldOption: (optionId, label) => {
      for (const field of fieldRows.values()) {
        if (!field.options.some((option) => option.id === optionId)) continue;
        fieldRows.set(field.id, {
          ...field,
          options: field.options.map((option) =>
            option.id === optionId ? { id: option.id, label } : option,
          ),
        });
      }
      return Promise.resolve();
    },
    removeFieldOption: (fieldId, optionId, albumIds) => {
      const field = fieldRows.get(fieldId)!;
      fieldRows.set(fieldId, {
        ...field,
        options: field.options.filter((option) => option.id !== optionId),
      });
      optionKeys.delete(optionId);
      // As the foreign keys do: a single choice empties, a multiple choice loses the option.
      for (const [key, value] of valueRows) {
        if (!key.endsWith(`:${fieldId}`)) continue;
        if (value === optionId) valueRows.set(key, null);
        else if (Array.isArray(value) && value.includes(optionId)) {
          const rest = value.filter((id) => id !== optionId);
          valueRows.set(key, rest.length > 0 ? rest : null);
        }
      }
      return Promise.resolve(
        albumIds.map((albumId) => ({
          albumId,
          fieldId,
          value: valueRows.get(fieldValueKey(albumId, fieldId)) ?? null,
        })),
      );
    },

    findContainer: (id) =>
      Promise.resolve(containerRows.has(id) ? { ...containerRows.get(id)! } : undefined),
    containerPath: (id) => {
      const path: string[] = [];
      for (let row = containerRows.get(id); row; row = containerRows.get(row.parentId ?? "")) {
        path.push(row.id);
      }
      return Promise.resolve(path);
    },
    subtreeDepth: (id) => {
      const row = containerRows.get(id);
      return Promise.resolve(row ? depthBelow(row) : 0);
    },
    activeChildren: (ownerId, parentId) =>
      Promise.resolve(
        activeChildren(ownerId, parentId).map(
          ({ id, kind, name, parentId: parent, description }): Container => ({
            id,
            kind,
            parentId: parent,
            name,
            description,
          }),
        ),
      ),
    countContainers: (ownerId) =>
      Promise.resolve([...containerRows.values()].filter((row) => row.ownerId === ownerId).length),
    insertContainer: (container) => {
      containerRows.set(container.id, { ...container, trashed: false });
      return Promise.resolve();
    },
    updateContainer: (id, values) => {
      containerRows.set(id, { ...containerRows.get(id)!, ...defined(values) });
      return Promise.resolve();
    },

    findMembership: (listId, albumId) => {
      const row = membershipRows.get(membershipKey(listId, albumId));
      if (!row) return Promise.resolve(undefined);
      const { ownerId: _, ...membership } = row;
      return Promise.resolve(membership);
    },
    countMemberships: (ownerId) =>
      Promise.resolve([...membershipRows.values()].filter((row) => row.ownerId === ownerId).length),
    activeSubtree: (id) => {
      const root = containerRows.get(id);
      if (!root || root.trashed) return Promise.resolve([]);
      const found: Container[] = [containerOf(root)];
      for (let index = 0; index < found.length; index += 1) {
        const parent = found[index]?.id;
        for (const row of containerRows.values()) {
          if (row.parentId === parent && !row.trashed) found.push(containerOf(row));
        }
      }
      return Promise.resolve(found);
    },
    listEntries: (listIds) =>
      Promise.resolve(
        [...membershipRows.values()]
          .filter((entry) => listIds.includes(entry.listId))
          .map(({ listId, albumId, addedAt }) => ({ listId, albumId, addedAt })),
      ),
    findTrashUnit: (id) => {
      const unit = unitRows.get(id);
      return Promise.resolve(unit && { ...unit });
    },
    unitContainers: (unitId) =>
      Promise.resolve(
        [...containerRows.values()]
          .filter((row) => unitOf.get(row.id) === unitId)
          .map((row) => containerOf(row)),
      ),
    trashContainers: (unit, ids) => {
      unitRows.set(unit.id, { ...unit });
      for (const id of ids) {
        const row = containerRows.get(id);
        if (row) containerRows.set(id, { ...row, trashed: true });
        unitOf.set(id, unit.id);
      }
      return Promise.resolve();
    },
    recoverContainers: (unitId, ids) => {
      for (const id of ids) {
        const row = containerRows.get(id);
        if (row) containerRows.set(id, { ...row, trashed: false });
        unitOf.delete(id);
      }
      unitRows.delete(unitId);
      return Promise.resolve();
    },
    insertMembership: (membership) => {
      membershipRows.set(membershipKey(membership.listId, membership.albumId), { ...membership });
      return Promise.resolve();
    },
    deleteMembership: (listId, albumId) => {
      membershipRows.delete(membershipKey(listId, albumId));
      return Promise.resolve();
    },

    findViewPrefs: (personId, viewKey) => {
      const row = viewRows.get(viewRowKey(personId, viewKey));
      return Promise.resolve(row && { ...row });
    },
    saveViewPrefs: (personId, prefs) => {
      viewRows.set(viewRowKey(personId, prefs.viewKey), { ...prefs });
      return Promise.resolve();
    },
    deleteViewPrefs: (personId, viewKey) => {
      viewRows.delete(viewRowKey(personId, viewKey));
      return Promise.resolve();
    },
    findDefaults: (personId) => {
      const row = defaultRows.get(personId);
      return Promise.resolve(row && { ...row });
    },
    saveDefaults: (personId, values) => {
      defaultRows.set(personId, { ...values });
      return Promise.resolve();
    },

    findPositions: (personId, viewKey, itemIds) =>
      Promise.resolve(
        new Map(
          itemIds.flatMap((itemId) => {
            const row = positionRows.get(positionRowKey(personId, viewKey, itemId));
            return row ? [[itemId, row.key] as const] : [];
          }),
        ),
      ),
    savePosition: (personId, position) => {
      positionRows.set(positionRowKey(personId, position.viewKey, position.itemId), {
        ...position,
        personId,
      });
      return Promise.resolve();
    },
    deletePosition: (personId, viewKey, itemId) =>
      Promise.resolve(positionRows.delete(positionRowKey(personId, viewKey, itemId))),
    firstKey: (personId, viewKey) => {
      const keys = [...positionRows.values()]
        .filter((row) => row.personId === personId && row.viewKey === viewKey)
        .map((row) => row.key)
        .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return Promise.resolve(keys[0]);
    },
    viewItems: (personId, viewKey, kind) => {
      if (kind === "containers") {
        // The root is the person's; a folder's children are its owner's, who may be someone sharing it.
        const ownerId = viewKey === "root" ? personId : containerRows.get(viewKey)?.ownerId;
        const parentId = viewKey === "root" ? null : viewKey;
        return Promise.resolve(
          new Set(activeChildren(ownerId ?? personId, parentId).map((row) => row.id)),
        );
      }
      const active = [...albumRows.values()].filter((album) => !album.trashed);
      if (viewKey === "unsorted") {
        return Promise.resolve(
          new Set(
            active
              .filter((album) => album.ownerId === personId && !inActiveList(album.id))
              .map((album) => album.id),
          ),
        );
      }
      const listed = new Set(
        [...membershipRows.values()]
          .filter((entry) => entry.listId === viewKey)
          .map((entry) => entry.albumId),
      );
      return Promise.resolve(
        new Set(active.filter((album) => listed.has(album.id)).map((a) => a.id)),
      );
    },
    inActiveList: (albumId) => Promise.resolve(inActiveList(albumId)),
    canReadShared: (personId, containerId) => {
      const state: SharingState = {
        containers: [...containerRows.values()],
        grants: [...grantRows.values()],
        links: [...shareLinkRows.values()].map((link) => ({
          id: link.id,
          containerId: link.containerId,
          revoked: link.revokedAt !== null,
        })),
        references: [...referenceRows.values()],
      };
      return Promise.resolve(
        readableContainers(state, { kind: "person", userId: personId }).has(containerId),
      );
    },

    findAccountByEmail: (key) => {
      const account = [...accountRows.values()].find((each) => each.email === key);
      return Promise.resolve(account && { id: account.id });
    },
    displayNameOf: (userId) => Promise.resolve(accountRows.get(userId)?.displayName ?? null),
    setDisplayName(userId, displayName) {
      const account = accountRows.get(userId);
      if (account) account.displayName = displayName;
      return Promise.resolve();
    },
    activeShareCount(ownerId) {
      const grants = [...grantRows.values()].filter(
        (grant) =>
          ownedBy(ownerId, grant.containerId) &&
          (grant.status === "pending" || grant.status === "accepted"),
      );
      const live = [...shareLinkRows.values()].filter(
        (link) => ownedBy(ownerId, link.containerId) && link.revokedAt === null,
      );
      return Promise.resolve(grants.length + live.length);
    },
    findOpenGrant(containerId, granteeId) {
      const grant = [...grantRows.values()].find(
        (each) =>
          each.containerId === containerId &&
          each.granteeId === granteeId &&
          (each.status === "pending" || each.status === "accepted"),
      );
      return Promise.resolve(grant && { id: grant.id, status: grant.status });
    },
    insertGrant(grant) {
      grantRows.set(grant.id, { ...grant });
      return Promise.resolve();
    },
    findGrant(id) {
      const grant = grantRows.get(id);
      return Promise.resolve(
        grant && {
          id: grant.id,
          status: grant.status,
          containerId: grant.containerId,
          granteeId: grant.granteeId,
        },
      );
    },
    moveGrant(id, from, to) {
      const grant = grantRows.get(id);
      if (grant?.status !== from) return Promise.resolve(false);
      grant.status = to;
      return Promise.resolve(true);
    },
    setGrantEmailStatus(id, status) {
      const grant = grantRows.get(id);
      if (grant) grant.emailStatus = status;
      return Promise.resolve();
    },
    dropGrantReference(viewerId, containerId) {
      const key = `${viewerId}:${containerId}`;
      if (referenceRows.get(key)?.linkId !== null) return Promise.resolve(false);
      return Promise.resolve(referenceRows.delete(key));
    },
    saveReference(viewerId, containerId, linkId) {
      const key = `${viewerId}:${containerId}`;
      const row = referenceRows.get(key);
      if (!row) {
        referenceRows.set(key, { viewerId, containerId, linkId: linkId ?? null });
        return Promise.resolve("inserted");
      }
      if (linkId === undefined || row.linkId === linkId) return Promise.resolve("unchanged");
      row.linkId = linkId;
      return Promise.resolve("updated");
    },
    removeReference(viewerId, containerId) {
      return Promise.resolve(referenceRows.delete(`${viewerId}:${containerId}`));
    },
    findLinkByHash(hash) {
      const link = [...shareLinkRows.values()].find(
        (each) =>
          each.revokedAt === null &&
          each.tokenHash.length === hash.length &&
          each.tokenHash.every((byte, at) => byte === hash[at]) &&
          containerRows.get(each.containerId)?.trashed === false,
      );
      const ownerId = link && containerRows.get(link.containerId)?.ownerId;
      return Promise.resolve(
        link && ownerId ? { id: link.id, containerId: link.containerId, ownerId } : undefined,
      );
    },
    findLiveLink(containerId) {
      const link = [...shareLinkRows.values()].find(
        (each) => each.containerId === containerId && each.revokedAt === null,
      );
      return Promise.resolve(link && { id: link.id });
    },
    insertLink(link) {
      shareLinkRows.set(link.id, { ...link, revokedAt: null });
      return Promise.resolve();
    },
    revokeLink(id, at) {
      const link = shareLinkRows.get(id);
      if (link) link.revokedAt = at;
      return Promise.resolve();
    },
  };
  return {
    store,
    albums: albumRows,
    identities: identityRows,
    provenance: provenanceRows,
    links: linkRows,
    fields: fieldRows,
    trashUnits: unitRows,
    unitOf,
    fieldValues: valueRows,
    containers: containerRows,
    memberships: membershipRows,
    views: viewRows,
    defaults: defaultRows,
    positions: positionRows,
    accounts: accountRows,
    grants: grantRows,
    shareLinks: shareLinkRows,
    references: referenceRows,
  };
}
