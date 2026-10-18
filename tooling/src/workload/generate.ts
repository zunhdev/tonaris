// The reference workload (TS-120, Q-01): 5,000 owned albums in 250 lists and 60 folders at most 6 levels deep,
// about 1.8 list memberships per album, 12 custom fields used on 40% of albums, and 3 shared collections holding
// 5,000 albums in total. The sync measurements (TON-21) and later performance tests run against it.
// generateWorkload() is pure and deterministic: one seed always yields the same rows, IDs and timestamps included.
// It avoids Bun APIs so that Node-run tools, such as Playwright tests, can import it.

import { createHash } from "node:crypto";

import type {
  accountSync,
  albumFieldMulti,
  albumFieldValues,
  albums,
  albumServiceLinks,
  containers,
  fieldDefinitions,
  fieldOptions,
  memberships,
  savedReferences,
  shareGrants,
  shareLinks,
  users,
} from "@tonaris/db";
import { nameKey, searchKey } from "@tonaris/domain";

import { Random } from "./random";
import {
  bandAdjectives,
  bandNouns,
  editionLabels,
  firstNames,
  folderNames,
  folderQualifiers,
  lastNames,
  listAdjectives,
  listNouns,
  moods,
  noteTexts,
  titlePatterns,
  titleWords,
  venues,
} from "./vocabulary";

type Insert<T extends { $inferInsert: object }> = T["$inferInsert"];

/** Rows per table, in an order that satisfies the foreign keys. */
export type WorkloadRows = {
  users: Insert<typeof users>[];
  accountSync: Insert<typeof accountSync>[];
  fieldDefinitions: Insert<typeof fieldDefinitions>[];
  fieldOptions: Insert<typeof fieldOptions>[];
  containers: Insert<typeof containers>[];
  albums: Insert<typeof albums>[];
  albumServiceLinks: Insert<typeof albumServiceLinks>[];
  memberships: Insert<typeof memberships>[];
  albumFieldValues: Insert<typeof albumFieldValues>[];
  albumFieldMulti: Insert<typeof albumFieldMulti>[];
  shareLinks: Insert<typeof shareLinks>[];
  shareGrants: Insert<typeof shareGrants>[];
  savedReferences: Insert<typeof savedReferences>[];
};

type ContainerKind = Insert<typeof containers>["kind"];

export type CollectionShape = {
  folders: number;
  lists: number;
  /** Containers on the path to the deepest list, that list included. */
  maxDepth: number;
  albums: number;
  /** Relative weights of an album being in 0, 1, 2… lists; 0 lists is Unsorted. */
  membershipWeights: readonly number[];
  /** The share of albums with at least one custom field applied. */
  fieldUsage: number;
  /** One container that holds the whole collection, so it can be shared as a unit. */
  root?: { kind: ContainerKind; name: string };
};

export type AccountShape = { email: string; displayName: string };

export type WorkloadShape = {
  seed: number;
  owner: AccountShape;
  owned: CollectionShape;
  /** Other people's collections, saved in the owner's Shared with me (FR-07.13). */
  shared: readonly {
    owner: AccountShape;
    /** An accepted invitation (TS-33), or a saved public link (TS-32). */
    via: "invitation" | "link";
    collection: CollectionShape & { root: NonNullable<CollectionShape["root"]> };
  }[];
};

/** The TS-120 reference workload. The owned membership weights average 1.81 lists per album. */
export const referenceWorkload: WorkloadShape = {
  seed: 120,
  owner: { email: "workload@tonaris.test", displayName: "Workload owner" },
  owned: {
    folders: 60,
    lists: 250,
    maxDepth: 6,
    albums: 5_000,
    membershipWeights: [0.08, 0.35, 0.35, 0.14, 0.06, 0.02],
    fieldUsage: 0.4,
  },
  shared: [
    {
      owner: { email: "workload-sharer-1@tonaris.test", displayName: "Mara Lindqvist" },
      via: "invitation",
      collection: {
        root: { kind: "folder", name: "Jazz archive" },
        folders: 4,
        lists: 14,
        maxDepth: 4,
        albums: 2_000,
        membershipWeights: [0, 0.7, 0.22, 0.08],
        fieldUsage: 0.4,
      },
    },
    {
      owner: { email: "workload-sharer-2@tonaris.test", displayName: "Tomás Ortega" },
      via: "link",
      collection: {
        root: { kind: "list", name: "Vinyl shelf" },
        folders: 0,
        lists: 0,
        maxDepth: 1,
        albums: 1_800,
        membershipWeights: [0, 1],
        fieldUsage: 0.4,
      },
    },
    {
      owner: { email: "workload-sharer-3@tonaris.test", displayName: "Yuki Sato" },
      via: "invitation",
      collection: {
        root: { kind: "folder", name: "City pop & beyond" },
        folders: 2,
        lists: 8,
        maxDepth: 3,
        albums: 1_200,
        membershipWeights: [0, 0.75, 0.2, 0.05],
        fieldUsage: 0.4,
      },
    },
  ],
};

export type Account = { id: string; email: string; displayName: string };

export type SharedCollection = {
  owner: Account;
  containerId: string;
  name: string;
  kind: ContainerKind;
  albums: number;
  via: "invitation" | "link";
  /** The public link's token, for opening the guest page; only its hash is stored (TS-32). */
  token?: string;
};

export type Workload = {
  owner: Account;
  shares: SharedCollection[];
  /** Every account the workload creates, the owner first. Seeding replaces their data. */
  accounts: Account[];
  rows: WorkloadRows;
};

const day = 86_400_000;
/** The workload's accounts are created at `start`; their content arrives over the following `span`. */
const start = Date.UTC(2024, 0, 15);
const span = 900 * day;
const end = start + span;

const stamps = (ms: number) => ({ createdAt: new Date(ms), updatedAt: new Date(ms) });

/** The time of the `i`th of `count` things created in order between `from` and `to`: one per equal slot. */
function spread(rng: Random, count: number, from: number, to: number): (i: number) => number {
  const step = (to - from) / count;
  return (i) => from + Math.floor((i + rng.next()) * step);
}

export function generateWorkload(shape: WorkloadShape = referenceWorkload): Workload {
  const random = new Random(shape.seed);
  const rows: WorkloadRows = {
    users: [],
    accountSync: [],
    fieldDefinitions: [],
    fieldOptions: [],
    containers: [],
    albums: [],
    albumServiceLinks: [],
    memberships: [],
    albumFieldValues: [],
    albumFieldMulti: [],
    shareLinks: [],
    shareGrants: [],
    savedReferences: [],
  };
  const artists = artistPool(random.derive("artists"));
  const accountIds = random.derive("accounts");
  const account = ({ email, displayName }: AccountShape): Account => {
    const id = accountIds.uuidv7(start);
    rows.users.push({
      id,
      email,
      emailVerified: true,
      displayName,
      role: "user",
      ...stamps(start),
    });
    rows.accountSync.push({ accountId: id, seq: 0, ...stamps(start) });
    return { id, email, displayName };
  };

  const owner = account(shape.owner);
  buildCollection({ rows, rng: random.derive("owned"), ownerId: owner.id, artists }, shape.owned);

  const shares = shape.shared.map(
    ({ owner: sharerShape, via, collection }, i): SharedCollection => {
      const sharer = account(sharerShape);
      const builder = { rows, rng: random.derive(`shared-${i}`), ownerId: sharer.id, artists };
      const root = buildCollection(builder, collection);
      if (!root) throw new Error("A shared collection needs a root container");
      const token = share(builder, root, owner.id, via);
      return {
        owner: sharer,
        containerId: root.id,
        name: collection.root.name,
        kind: collection.root.kind,
        albums: collection.albums,
        via,
        ...(token && { token }),
      };
    },
  );

  return { owner, shares, accounts: [owner, ...shares.map((s) => s.owner)], rows };
}

type Builder = { rows: WorkloadRows; rng: Random; ownerId: string; artists: readonly string[] };
type Container = { id: string; depth: number; createdAt: number };
type Album = { id: string; createdAt: number };

/** Builds one owner's collection and returns its root container, if the shape has one. */
function buildCollection(b: Builder, shape: CollectionShape): Container | undefined {
  const { root, lists } = buildTree(b, shape);
  const albums = buildAlbums(b, shape.albums);
  buildMemberships(b, lists, albums, shape.membershipWeights);
  buildFields(b, albums, shape.fieldUsage);
  return root;
}

/** Unique among the siblings in `taken` by name key (X-06); proposes again, then numbers, on a collision. */
function uniqueName(taken: Set<string>, propose: () => string): string {
  const claim = (name: string) => {
    const key = nameKey(name);
    if (taken.has(key)) return undefined;
    taken.add(key);
    return name;
  };
  for (let attempt = 0; attempt < 10; attempt++) {
    const name = claim(propose());
    if (name) return name;
  }
  const base = propose();
  for (let n = 2; ; n++) {
    const name = claim(`${base} ${n}`);
    if (name) return name;
  }
}

/**
 * Folders and lists. A chain of folders goes straight down so the deepest list sits at `maxDepth`; the other
 * folders and lists hang off the top or a folder, and folders leave room for a list below them.
 */
function buildTree(b: Builder, shape: CollectionShape): { root?: Container; lists: Container[] } {
  const rng = b.rng.derive("tree");
  const count = shape.folders + shape.lists + (shape.root ? 1 : 0);
  const time = spread(rng, count, start, start + span * 0.6);
  const siblingNames = new Map<string | null, Set<string>>();
  let created = 0;

  const add = (kind: ContainerKind, parent: Container | null, propose: () => string) => {
    const parentId = parent?.id ?? null;
    let taken = siblingNames.get(parentId);
    if (!taken) siblingNames.set(parentId, (taken = new Set()));
    const name = uniqueName(taken, propose);
    const createdAt = time(created++);
    const container = { id: rng.uuidv7(createdAt), depth: (parent?.depth ?? 0) + 1, createdAt };
    b.rows.containers.push({
      id: container.id,
      ownerId: b.ownerId,
      kind,
      parentId,
      name,
      nameKey: nameKey(name),
      ...stamps(createdAt),
    });
    return container;
  };
  const folderName = () =>
    rng.chance(0.35)
      ? `${rng.pick(folderNames)} ${rng.pick(folderQualifiers)}`
      : rng.pick(folderNames);
  const listName = () =>
    rng.chance(0.12)
      ? `Best of ${rng.int(1960, 2025)}`
      : `${rng.pick(listAdjectives)} ${rng.pick(listNouns)}`;

  const rootShape = shape.root;
  const root = rootShape && add(rootShape.kind, null, () => rootShape.name);
  if (root && rootShape?.kind === "list") {
    if (shape.folders + shape.lists > 0) throw new Error("A list can't contain folders or lists");
    return { root, lists: [root] };
  }

  const top = root ?? null;
  const topDepth = top?.depth ?? 0;
  // Shallow folders are likelier parents, so most content sits a level or two down, as in real collections.
  const parentAmong = (folders: readonly Container[]) =>
    rng.pickWeighted(
      [top, ...folders],
      [1, ...folders.map((folder) => 0.35 ** (folder.depth - topDepth))],
    );

  const folders: Container[] = [];
  let deepest = top;
  while (folders.length < shape.folders && (deepest?.depth ?? 0) < shape.maxDepth - 1) {
    deepest = add("folder", deepest, folderName);
    folders.push(deepest);
  }
  while (folders.length < shape.folders) {
    const roomy = folders.filter((folder) => folder.depth < shape.maxDepth - 1);
    folders.push(add("folder", parentAmong(roomy), folderName));
  }

  const lists: Container[] = [];
  for (let i = 0; i < shape.lists; i++) {
    lists.push(add("list", i === 0 ? deepest : parentAmong(folders), listName));
  }
  return { ...(root && { root }), lists };
}

/** About 1,200 artists, shuffled so the most frequent ones mix solo acts and bands. */
function artistPool(rng: Random): string[] {
  const names = new Set<string>();
  for (const first of firstNames) for (const last of lastNames) names.add(`${first} ${last}`);
  for (const adjective of bandAdjectives) {
    for (const noun of bandNouns) {
      names.add(rng.chance(0.5) ? `The ${adjective} ${noun}` : `${adjective} ${noun}`);
    }
  }
  return rng.shuffle([...names]);
}

type AlbumDescription = Pick<
  Insert<typeof albums>,
  | "title"
  | "artistCredit"
  | "releaseType"
  | "isLive"
  | "originalYear"
  | "recordingYearStart"
  | "recordingYearEnd"
  | "editionLabel"
  | "mbReleaseId"
  | "mbReleaseGroupId"
  | "barcode"
>;

const digits = "0123456789";

function describeAlbum(rng: Random, artists: readonly string[]): AlbumDescription {
  // A few artists have dozens of albums, most have a handful.
  const artist = () => rng.pickSkewed(artists, 2.5);
  const artistCredit = rng.chance(0.06) ? `${artist()} & ${artist()}` : artist();
  const releaseType = rng.pickWeighted(
    ["album", "ep", "compilation", null] as const,
    [0.7, 0.12, 0.08, 0.1],
  );
  const isLive = rng.chance(0.06) ? true : rng.chance(0.15) ? null : false;
  // Skewed towards recent decades.
  const year = 1950 + Math.round(76 * Math.sqrt(rng.next()));
  const word = () => rng.pick(titleWords);

  let title: string;
  if (isLive) title = rng.chance(0.6) ? `Live at ${rng.pick(venues)}` : `${word()} (Live)`;
  else if (releaseType === "compilation")
    title = rng.pick(["Greatest Hits", `The Best of ${artistCredit}`, `${word()}: An Anthology`]);
  else title = rng.pick(titlePatterns)(word(), word());

  const recordingYearStart = isLive ? year - rng.int(0, 2) : null;
  const identified = rng.chance(0.85);
  return {
    title,
    artistCredit,
    releaseType,
    isLive,
    // A live album may know only when it was recorded (FR-02.6).
    originalYear: isLive && rng.chance(0.3) ? null : year,
    recordingYearStart,
    recordingYearEnd:
      recordingYearStart !== null && recordingYearStart < year && rng.chance(0.3)
        ? recordingYearStart + 1
        : null,
    editionLabel: rng.chance(0.12) ? rng.pick(editionLabels) : null,
    mbReleaseId: identified ? rng.uuidv4() : null,
    mbReleaseGroupId: identified ? rng.uuidv4() : null,
    barcode: rng.chance(0.6) ? rng.string(digits, rng.chance(0.8) ? 12 : 13) : null,
  };
}

/** Another edition of an album already in the collection: same work, its own release (FR-02.9). */
function reissue(rng: Random, original: AlbumDescription): AlbumDescription {
  return {
    ...original,
    editionLabel: rng.pick(editionLabels.filter((label) => label !== original.editionLabel)),
    mbReleaseId: original.mbReleaseGroupId ? rng.uuidv4() : null,
    barcode: rng.chance(0.6) ? rng.string(digits, 13) : null,
  };
}

function buildAlbums(b: Builder, count: number): Album[] {
  const rng = b.rng.derive("albums");
  const time = spread(rng, count, start, end);
  const descriptions: AlbumDescription[] = [];
  const made: Album[] = [];
  for (let i = 0; i < count; i++) {
    const createdAt = time(i);
    const description =
      descriptions.length > 0 && rng.chance(0.05)
        ? reissue(rng, rng.pick(descriptions))
        : describeAlbum(rng, b.artists);
    const album = { id: rng.uuidv7(createdAt), createdAt };
    descriptions.push(description);
    made.push(album);
    b.rows.albums.push({
      id: album.id,
      ownerId: b.ownerId,
      ...description,
      searchTitleKey: searchKey(description.title),
      searchArtistKey: searchKey(description.artistCredit),
      ...stamps(createdAt),
    });
    addServiceLinks(b, rng, album, description.title);
  }
  return made;
}

type Service = Insert<typeof albumServiceLinks>["service"];

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const services: readonly Service[] = ["spotify", "apple-music", "qobuz"];

/** The link the album was captured from, sometimes a second service's too (FR-06.2). */
function addServiceLinks(b: Builder, rng: Random, album: Album, title: string): void {
  const primary = rng.pickWeighted(services, [0.5, 0.3, 0.2]);
  const linked = rng.chance(0.15)
    ? [primary, rng.pick(services.filter((service) => service !== primary))]
    : [primary];
  for (const service of linked) {
    b.rows.albumServiceLinks.push({
      albumId: album.id,
      ownerId: b.ownerId,
      service,
      ...serviceLink[service](rng, title),
      ...stamps(album.createdAt),
    });
  }
}

/** An album ID and URL in each service's own format (TS-40). */
const serviceLink: Record<
  Service,
  (rng: Random, title: string) => { entityId: string; url: string }
> = {
  spotify: (rng) => {
    const entityId = rng.string(base62, 22);
    return { entityId, url: `https://open.spotify.com/album/${entityId}` };
  },
  "apple-music": (rng, title) => {
    const entityId = String(rng.int(100_000_000, 1_999_999_999));
    const slug = searchKey(title)
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "");
    return { entityId, url: `https://music.apple.com/us/album/${slug || "album"}/${entityId}` };
  },
  qobuz: (rng) => {
    const entityId = rng.string("0123456789abcdefghijklmnopqrstuvwxyz", 13);
    return { entityId, url: `https://open.qobuz.com/album/${entityId}` };
  },
};

/** Puts each album in some lists. List sizes are heavy-tailed: a few hold hundreds, most a few dozen. */
function buildMemberships(
  b: Builder,
  lists: readonly Container[],
  albums: readonly Album[],
  weights: readonly number[],
): void {
  const rng = b.rng.derive("memberships");
  const listWeights = lists.map(() => (1 - rng.next()) ** -0.7);
  for (const album of albums) {
    const count = Math.min(rng.weighted(weights), lists.length);
    const chosen = new Set<Container>();
    while (chosen.size < count) chosen.add(rng.pickWeighted(lists, listWeights));
    for (const list of chosen) {
      const addedAt = Math.min(
        Math.max(album.createdAt, list.createdAt) + rng.int(0, 14 * day),
        end,
      );
      b.rows.memberships.push({
        listId: list.id,
        albumId: album.id,
        ownerId: b.ownerId,
        addedAt: new Date(addedAt),
        ...stamps(addedAt),
      });
    }
  }
}

type FieldSpec =
  | { name: string; type: "text"; texts: readonly string[] }
  | { name: string; type: "number"; min: number; max: number; decimals: number }
  | { name: string; type: "date" | "yes_no" }
  | { name: string; type: "single_choice" | "multiple_choice"; options: readonly string[] };

/** Twelve fields, two of each type (FR-03.6). */
const fieldSpecs: readonly FieldSpec[] = [
  { name: "Rating", type: "single_choice", options: ["★", "★★", "★★★", "★★★★", "★★★★★"] },
  {
    name: "Condition",
    type: "single_choice",
    options: ["Mint", "Near mint", "Very good plus", "Very good", "Good"],
  },
  { name: "Mood", type: "multiple_choice", options: moods },
  {
    name: "Formats owned",
    type: "multiple_choice",
    options: ["Vinyl", "CD", "Cassette", "Digital", "SACD"],
  },
  { name: "Listened", type: "yes_no" },
  { name: "Favorite", type: "yes_no" },
  { name: "Notes", type: "text", texts: noteTexts },
  { name: "Recommended by", type: "text", texts: firstNames },
  { name: "Price paid", type: "number", min: 5, max: 60, decimals: 2 },
  { name: "Plays", type: "number", min: 1, max: 250, decimals: 0 },
  { name: "First listened", type: "date" },
  { name: "Purchased on", type: "date" },
];

type Field = { id: string; spec: FieldSpec; optionIds: string[] };
type FieldValue = Pick<
  Insert<typeof albumFieldValues>,
  "textValue" | "numberValue" | "dateValue" | "boolValue" | "optionId"
>;

/**
 * The key fractional-indexing's `generateNKeysBetween(null, null, n)` gives the `i`th of `n` items, for
 * `n` ≤ 62 (TS-16): "a0", "a1"… "az".
 */
function initialOrderKey(i: number): string {
  if (i >= base62.length) throw new RangeError(`No initial order key for item ${i}`);
  return `a${base62.charAt(i)}`;
}

function buildFields(b: Builder, albums: readonly Album[], usage: number): void {
  const rng = b.rng.derive("fields");
  const fields = fieldSpecs.map((spec, i): Field => {
    // Defined in the first minutes after the account was created.
    const createdAt = start + (i + 1) * 60_000;
    const id = rng.uuidv7(createdAt);
    b.rows.fieldDefinitions.push({
      id,
      ownerId: b.ownerId,
      name: spec.name,
      nameKey: nameKey(spec.name),
      type: spec.type,
      ...stamps(createdAt),
    });
    const options = "options" in spec ? spec.options : [];
    const optionIds = options.map((label, j) => {
      const optionId = rng.uuidv7(createdAt);
      b.rows.fieldOptions.push({
        id: optionId,
        fieldId: id,
        label,
        labelKey: nameKey(label),
        sortKey: initialOrderKey(j),
        ...stamps(createdAt),
      });
      return optionId;
    });
    return { id, spec, optionIds };
  });

  for (const album of albums) {
    if (!rng.chance(usage)) continue;
    for (const field of rng.shuffle(fields).slice(0, rng.int(1, 6))) {
      // Some fields are applied but left empty (FR-03.7).
      const empty = rng.chance(0.1);
      const value: FieldValue = empty ? {} : fieldValue(rng, field);
      b.rows.albumFieldValues.push({
        albumId: album.id,
        fieldId: field.id,
        ...value,
        ...stamps(album.createdAt),
      });
      if (field.spec.type !== "multiple_choice" || empty) continue;
      for (const optionId of rng.shuffle(field.optionIds).slice(0, rng.int(1, 3))) {
        b.rows.albumFieldMulti.push({
          albumId: album.id,
          fieldId: field.id,
          optionId,
          ...stamps(album.createdAt),
        });
      }
    }
  }
}

/** The value columns for one applied field. Multiple-choice selections live in `album_field_multi`. */
function fieldValue(rng: Random, { spec, optionIds }: Field): FieldValue {
  switch (spec.type) {
    case "text":
      return { textValue: rng.pick(spec.texts) };
    case "number": {
      const scale = 10 ** spec.decimals;
      const value = rng.int(spec.min * scale, spec.max * scale) / scale;
      return { numberValue: value.toFixed(spec.decimals) };
    }
    case "date":
      return {
        dateValue: new Date(rng.int(Date.UTC(2005, 0, 1), end)).toISOString().slice(0, 10),
      };
    case "yes_no":
      return { boolValue: rng.chance(0.6) };
    case "single_choice":
      return { optionId: rng.pick(optionIds) };
    case "multiple_choice":
      break;
  }
  return {};
}

/** Saves `root` in the viewer's Shared with me. Returns the link token when shared by link. */
function share(
  b: Builder,
  root: Container,
  viewerId: string,
  via: "invitation" | "link",
): string | undefined {
  const rng = b.rng.derive("share");
  const sharedAt = root.createdAt + day;
  const reference = { viewerId, containerId: root.id, ...stamps(sharedAt) };
  if (via === "invitation") {
    // Accepting an invitation saves the reference (TS-33).
    b.rows.shareGrants.push({
      id: rng.uuidv7(sharedAt),
      containerId: root.id,
      granteeId: viewerId,
      status: "accepted",
      emailStatus: "sent",
      ...stamps(sharedAt),
    });
    b.rows.savedReferences.push({ ...reference, linkId: null });
    return undefined;
  }
  const token = Buffer.from(rng.bytes(32)).toString("base64url");
  const linkId = rng.uuidv7(sharedAt);
  b.rows.shareLinks.push({
    id: linkId,
    containerId: root.id,
    tokenHash: createHash("sha256").update(token).digest(),
    ...stamps(sharedAt),
  });
  b.rows.savedReferences.push({ ...reference, linkId });
  return token;
}
