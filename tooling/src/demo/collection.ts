// The demo collection (TON-308): a small, hand-made collection of invented albums for the Help pages' pictures, so
// no real album's name or artwork ever appears in them. Robin owns it: folders and lists in colors with icons,
// albums with links to the five services, custom fields of all six types, a list shared by link, a folder shared
// with Sam to edit, and Mira's list shared with Robin. Every cover is drawn for its album; the pictures run serves
// them in place of the image proxy (apps/web/pictures). Pure and deterministic, like the reference workload.

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
  profileFavorites,
  savedReferences,
  shareGrants,
  shareLinks,
  users,
  viewPrefs,
} from "@tonaris/db";
import {
  latinKey,
  nameKey,
  termsVersion,
  type ContainerColor,
  type ContainerIconName,
  type FieldType,
  type StreamingService,
} from "@tonaris/domain";
import { albumUrl } from "@tonaris/providers";

import { Random } from "../workload/random";

type Insert<T extends { $inferInsert: object }> = T["$inferInsert"];

export type DemoRows = {
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
  profileFavorites: Insert<typeof profileFavorites>[];
  viewPrefs: Insert<typeof viewPrefs>[];
};

export type DemoAccount = { id: string; email: string; displayName: string };

export type Demo = {
  /** Robin, whose collection the pictures show. */
  owner: DemoAccount;
  /** Mira shares a list with Robin; Sam edits Robin's Jazz folder. */
  friends: { mira: DemoAccount; sam: DemoAccount };
  /** Every account, the owner first. Seeding replaces their data. */
  accounts: DemoAccount[];
  /** The token of the link Late night is shared by, for the guest page's pictures. */
  linkToken: string;
  rows: DemoRows;
};

/** Where an album's cover is, by its key: the pictures run answers these from its own drawings. */
export const coverUrl = (key: string) => `https://covers.tonaris.test/${key}.png`;

export const demoEmails = {
  owner: "robin@demo.tonaris.test",
  mira: "mira@demo.tonaris.test",
  sam: "sam@demo.tonaris.test",
} as const;

type AlbumSpec = {
  /** The cover's key (apps/web/pictures/covers.ts). */
  cover: string;
  title: string;
  artist: string;
  year: number | null;
  type?: "album" | "ep" | "single" | "compilation";
  live?: { from: number; to?: number };
  services: readonly StreamingService[];
  /** The lists it's in, by name. */
  lists?: readonly string[];
};

/** Robin's albums: the landing page's ten, then fourteen more. Two are in no list, so Unsorted holds them. */
const robinAlbums: readonly AlbumSpec[] = [
  {
    cover: "bus",
    title: "Night Bus Hymns",
    artist: "Sodium Choir",
    year: 1996,
    services: ["spotify", "qobuz"],
    lists: ["Late night", "Road trips"],
  },
  {
    cover: "tide",
    title: "Low Tide Archive",
    artist: "Maren Okafor",
    year: 2019,
    services: ["apple-music"],
    lists: ["Late night", "Rainy Sundays"],
  },
  {
    cover: "machines",
    title: "Quiet Machines",
    artist: "Elin Varga",
    year: 2014,
    services: ["spotify", "tidal"],
    lists: ["Late night", "Morning coffee"],
  },
  {
    cover: "field",
    title: "Field Notes",
    artist: "Noor Halvorsen",
    year: 2021,
    services: ["spotify", "apple-music", "qobuz"],
    lists: ["Late night", "Rainy Sundays"],
  },
  {
    cover: "bluehour",
    title: "Blue Hour Sessions",
    artist: "Ayo Lindqvist Quartet",
    year: 1961,
    services: ["apple-music", "qobuz"],
    lists: ["Late night", "Hard bop"],
  },
  {
    cover: "bloom",
    title: "Static Bloom",
    artist: "Glass Orchard",
    year: 1993,
    services: ["spotify"],
    lists: ["Late night", "Road trips"],
  },
  {
    cover: "suns",
    title: "Paper Suns",
    artist: "Wren & the Tall Grass",
    year: 1974,
    services: ["youtube-music"],
    lists: ["Road trips", "Morning coffee"],
  },
  {
    cover: "garden",
    title: "Concrete Garden",
    artist: "Dela Moreau",
    year: 2011,
    type: "ep",
    services: ["spotify"],
    lists: ["Late night"],
  },
  {
    cover: "uv",
    title: "Ultraviolet Commute",
    artist: "Kai Sønder",
    year: 2023,
    type: "ep",
    services: ["tidal"],
    lists: ["Road trips"],
  },
  {
    cover: "radio",
    title: "Saltwater Radio",
    artist: "Harbour Lights",
    year: 1985,
    live: { from: 1985 },
    services: ["apple-music"],
    lists: ["Late night"],
  },
  {
    cover: "saudade",
    title: "Saudade Avenue",
    artist: "Lúcia Brandão",
    year: 1979,
    services: ["spotify", "apple-music"],
    lists: ["Rainy Sundays"],
  },
  {
    cover: "koen",
    title: "Kōen no Asa",
    artist: "Hiro Tanabe Trio",
    year: 1984,
    services: ["qobuz"],
    lists: ["Morning coffee"],
  },
  {
    cover: "copper",
    title: "Copper & Salt",
    artist: "Amara Nwosu",
    year: 2017,
    services: ["spotify"],
    lists: ["Road trips"],
  },
  {
    cover: "ferry",
    title: "Midnight Ferry",
    artist: "Coastline Orchestra",
    year: 1988,
    services: ["apple-music"],
  },
  {
    cover: "telegraph",
    title: "Desert Telegraph",
    artist: "Sahel Wires",
    year: 2015,
    services: ["spotify", "youtube-music"],
    lists: ["Road trips"],
  },
  {
    cover: "velvet",
    title: "Velvet Static",
    artist: "Juno Park",
    year: 2026,
    services: ["spotify"],
    lists: ["Discoveries 2026"],
  },
  {
    cover: "brass",
    title: "Low Brass Weather",
    artist: "Okonkwo-Reyes Sextet",
    year: 1966,
    services: ["qobuz"],
    lists: ["Hard bop"],
  },
  {
    cover: "spiral",
    title: "Spiral Hymn",
    artist: "Alice Moreno Ensemble",
    year: 1971,
    services: ["apple-music", "tidal"],
    lists: ["Spiritual jazz"],
  },
  {
    cover: "firstlight",
    title: "First Light Tapes",
    artist: "Dawn Wire",
    year: 2026,
    type: "ep",
    services: ["spotify"],
    lists: ["Discoveries 2026", "To listen"],
  },
  {
    cover: "harbour",
    title: "Harbour Songs",
    artist: "Iona MacLeod",
    year: 2003,
    services: ["apple-music"],
    lists: ["Rainy Sundays"],
  },
  {
    cover: "roundhouse",
    title: "Live at the Roundhouse",
    artist: "Stillwater",
    year: 1999,
    live: { from: 1998 },
    services: ["tidal"],
    lists: ["To listen"],
  },
  {
    cover: "ojos",
    title: "Ojos de Agua",
    artist: "Valeria Ruiz",
    year: 2026,
    services: ["youtube-music"],
    lists: ["Discoveries 2026", "To listen"],
  },
  { cover: "orbit", title: "Slow Orbit", artist: "Tessellate", year: 2012, services: ["spotify"] },
  {
    cover: "lantern",
    title: "Lantern Room",
    artist: "Okari Mwangi Quintet",
    year: 1959,
    services: ["apple-music"],
    lists: ["Hard bop", "Spiritual jazz"],
  },
];

/** Mira's list, shared with Robin to view. */
const miraAlbums: readonly AlbumSpec[] = [
  {
    cover: "sunbleached",
    title: "Sunbleached",
    artist: "Coral Static",
    year: 2026,
    services: ["spotify"],
    lists: ["Summer 2026"],
  },
  {
    cover: "postcards",
    title: "Tidal Postcards",
    artist: "Lena Ivers",
    year: 2025,
    services: ["apple-music"],
    lists: ["Summer 2026"],
  },
  {
    cover: "heatwave",
    title: "Heatwave Radio",
    artist: "Palmyra",
    year: 2024,
    services: ["spotify", "tidal"],
    lists: ["Summer 2026"],
  },
];

type ContainerSpec = {
  kind: "folder" | "list";
  name: string;
  color?: ContainerColor;
  icon?: ContainerIconName;
  description?: string;
  children?: readonly ContainerSpec[];
  /** The view's own layout, when not the account's default. */
  layout?: "rows" | "grid";
};

const robinTree: readonly ContainerSpec[] = [
  {
    kind: "folder",
    name: "Moods",
    color: "amber",
    icon: "moon",
    children: [
      {
        kind: "list",
        name: "Late night",
        layout: "grid",
        description:
          "For after midnight: slow, warm and **quiet**. Nothing that wakes the neighbours.",
      },
      { kind: "list", name: "Rainy Sundays" },
      { kind: "list", name: "Morning coffee" },
    ],
  },
  {
    kind: "folder",
    name: "Jazz",
    color: "blue",
    icon: "saxophone",
    description: "Records from the **1950s to the 70s**, mostly from my dad's shelf.",
    children: [
      { kind: "list", name: "Hard bop", layout: "grid" },
      { kind: "list", name: "Spiritual jazz" },
    ],
  },
  { kind: "list", name: "Road trips", color: "teal", icon: "campfire" },
  { kind: "list", name: "Discoveries 2026", color: "green", icon: "sparkles", layout: "grid" },
  { kind: "list", name: "To listen" },
];

const miraTree: readonly ContainerSpec[] = [
  { kind: "list", name: "Summer 2026", color: "orange", icon: "star" },
];

type FieldSpec = {
  name: string;
  type: FieldType;
  options?: readonly string[];
};

const robinFields: readonly FieldSpec[] = [
  { name: "Rating", type: "single_choice", options: ["★", "★★", "★★★", "★★★★", "★★★★★"] },
  { name: "Format", type: "multiple_choice", options: ["Vinyl", "CD", "Cassette", "Digital"] },
  { name: "Bought", type: "date" },
  { name: "Heard live", type: "yes_no" },
  { name: "Plays", type: "number" },
  { name: "Notes", type: "text" },
];

/** One field's value on an album, by the field's type. */
type Value =
  | { option: string }
  | { options: readonly string[] }
  | { date: string }
  | { yes: boolean }
  | { number: number }
  | { text: string };

/** Field values by album title, then field name. */
const robinValues: Record<string, Record<string, Value>> = {
  "Blue Hour Sessions": {
    Rating: { option: "★★★★★" },
    Format: { options: ["Vinyl"] },
    Bought: { date: "2019-04-13" },
    "Heard live": { yes: false },
    Notes: { text: "My dad's copy, a little worn on side B." },
  },
  "Night Bus Hymns": {
    Rating: { option: "★★★★" },
    Format: { options: ["CD", "Digital"] },
    "Heard live": { yes: true },
    Plays: { number: 42 },
  },
  "Field Notes": {
    Rating: { option: "★★★★★" },
    Format: { options: ["Vinyl", "Digital"] },
    Bought: { date: "2021-11-02" },
  },
  "Low Tide Archive": { Rating: { option: "★★★★" }, Plays: { number: 17 } },
  "Saudade Avenue": {
    Format: { options: ["Vinyl"] },
    Bought: { date: "2024-08-30" },
    Notes: { text: "Found it in a shop in Lisbon." },
  },
  "Lantern Room": { Rating: { option: "★★★★" }, Format: { options: ["Vinyl"] } },
  "Velvet Static": { Plays: { number: 9 } },
};

const robinFavorites = ["Blue Hour Sessions", "Field Notes", "Night Bus Hymns", "Paper Suns"];

const day = 86_400_000;
/** Robin joined on 2 March 2026; the albums arrived over the months after. */
const start = Date.UTC(2026, 2, 2);
const stamps = (ms: number) => ({ createdAt: new Date(ms), updatedAt: new Date(ms) });

const entityIds: Record<StreamingService, (rng: Random) => string> = {
  spotify: (rng) =>
    rng.string("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 22),
  "apple-music": (rng) => String(rng.int(100_000_000, 1_999_999_999)),
  qobuz: (rng) => rng.string("0123456789abcdefghijklmnopqrstuvwxyz", 13),
  tidal: (rng) => String(rng.int(1_000_000, 499_999_999)),
  "youtube-music": (rng) =>
    `OLAK5uy_${rng.string("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-", 33)}`,
};

/** The id of the folder or list called `name`. */
function container(made: Map<string, string>, name: string): string {
  const id = made.get(name);
  if (!id) throw new Error(`No folder or list "${name}"`);
  return id;
}

export function generateDemo(): Demo {
  const random = new Random(2026);
  const rows: DemoRows = {
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
    profileFavorites: [],
    viewPrefs: [],
  };
  const ids = random.derive("ids");
  let clock = start;
  /** The next moment, a few hours after the last, so everything has its own time in a stable order. */
  const tick = () => (clock += ids.int(1, 8) * 3_600_000);

  const account = (email: string, displayName: string, avatarHue: number, about: string | null) => {
    const id = ids.uuidv7(start);
    rows.users.push({
      id,
      email,
      emailVerified: true,
      displayName,
      avatarHue,
      about,
      role: "user",
      termsVersion,
      termsAgreedAt: new Date(start),
      ...stamps(start),
    });
    rows.accountSync.push({ accountId: id, seq: 0, ...stamps(start) });
    return { id, email, displayName };
  };

  const owner = account(
    demoEmails.owner,
    "Robin",
    210,
    "Collecting since my first cassette. Mostly jazz, ambient, and anything for a long drive.",
  );
  const mira = account(demoEmails.mira, "Mira", 330, "Summer playlists, all year round.");
  const sam = account(demoEmails.sam, "Sam", 120, null);

  const tree = (ownerId: string, specs: readonly ContainerSpec[], parentId: string | null) => {
    const made = new Map<string, string>();
    for (const spec of specs) {
      const at = tick();
      const id = ids.uuidv7(at);
      rows.containers.push({
        id,
        ownerId,
        kind: spec.kind,
        parentId,
        name: spec.name,
        nameKey: nameKey(spec.name),
        searchNameKey: latinKey(spec.name),
        description: spec.description ?? null,
        color: spec.color ?? null,
        icon: spec.icon ?? null,
        ...stamps(at),
      });
      made.set(spec.name, id);
      if (spec.layout) {
        rows.viewPrefs.push({ personId: ownerId, viewKey: id, layout: spec.layout, ...stamps(at) });
      }
      for (const [name, child] of tree(ownerId, spec.children ?? [], id)) made.set(name, child);
    }
    return made;
  };

  const collection = (ownerId: string, specs: readonly AlbumSpec[], lists: Map<string, string>) => {
    const made = new Map<string, string>();
    const rng = random.derive(`albums-${ownerId}`);
    for (const spec of specs) {
      const at = tick();
      const id = ids.uuidv7(at);
      made.set(spec.title, id);
      rows.albums.push({
        id,
        ownerId,
        title: spec.title,
        artistCredit: spec.artist,
        releaseType: spec.type ?? "album",
        isLive: spec.live !== undefined,
        originalYear: spec.year,
        recordingYearStart: spec.live?.from ?? null,
        recordingYearEnd: spec.live?.to ?? null,
        artworkUrl: coverUrl(spec.cover),
        mbReleaseId: rng.uuidv4(),
        mbReleaseGroupId: rng.uuidv4(),
        searchTitleKey: latinKey(spec.title),
        searchArtistKey: latinKey(spec.artist),
        ...stamps(at),
      });
      for (const service of spec.services) {
        const entityId = entityIds[service](rng);
        rows.albumServiceLinks.push({
          albumId: id,
          ownerId,
          service,
          entityId,
          url: albumUrl(service, entityId),
          ...stamps(at),
        });
      }
      for (const name of spec.lists ?? []) {
        const listId = lists.get(name);
        if (!listId) throw new Error(`No list "${name}" for "${spec.title}"`);
        rows.memberships.push({
          listId,
          albumId: id,
          ownerId,
          addedAt: new Date(at),
          ...stamps(at),
        });
      }
    }
    return made;
  };

  const robinContainers = tree(owner.id, robinTree, null);
  const robinAlbumIds = collection(owner.id, robinAlbums, robinContainers);
  const miraContainers = tree(mira.id, miraTree, null);
  collection(mira.id, miraAlbums, miraContainers);

  // Custom fields, defined on Robin's first day.
  const fieldIds = new Map<string, { id: string; options: Map<string, string> }>();
  for (const [i, spec] of robinFields.entries()) {
    const at = start + (i + 1) * 60_000;
    const id = ids.uuidv7(at);
    rows.fieldDefinitions.push({
      id,
      ownerId: owner.id,
      name: spec.name,
      nameKey: nameKey(spec.name),
      type: spec.type,
      ...stamps(at),
    });
    const options = new Map<string, string>();
    for (const [j, label] of (spec.options ?? []).entries()) {
      const optionId = ids.uuidv7(at);
      options.set(label, optionId);
      // fractional-indexing's first keys for n ≤ 62: "a0", "a1"… (TS-16).
      rows.fieldOptions.push({
        id: optionId,
        fieldId: id,
        label,
        labelKey: nameKey(label),
        sortKey: `a${j}`,
        ...stamps(at),
      });
    }
    fieldIds.set(spec.name, { id, options });
  }
  for (const [title, values] of Object.entries(robinValues)) {
    const albumId = robinAlbumIds.get(title);
    if (!albumId) throw new Error(`No album "${title}" for its field values`);
    const at = tick();
    for (const [name, value] of Object.entries(values)) {
      const field = fieldIds.get(name);
      if (!field) throw new Error(`No field "${name}"`);
      const option = (label: string) => {
        const optionId = field.options.get(label);
        if (!optionId) throw new Error(`No option "${label}" in "${name}"`);
        return optionId;
      };
      const row: Insert<typeof albumFieldValues> = { albumId, fieldId: field.id, ...stamps(at) };
      if ("option" in value) row.optionId = option(value.option);
      else if ("date" in value) row.dateValue = value.date;
      else if ("yes" in value) row.boolValue = value.yes;
      else if ("number" in value) row.numberValue = String(value.number);
      else if ("text" in value) row.textValue = value.text;
      rows.albumFieldValues.push(row);
      if (!("options" in value)) continue;
      for (const label of value.options) {
        rows.albumFieldMulti.push({
          albumId,
          fieldId: field.id,
          optionId: option(label),
          ...stamps(at),
        });
      }
    }
  }

  for (const [position, title] of robinFavorites.entries()) {
    const albumId = robinAlbumIds.get(title);
    if (!albumId) throw new Error(`No favorite "${title}"`);
    rows.profileFavorites.push({ userId: owner.id, albumId, position, ...stamps(tick()) });
  }

  // Sharing: Late night by link, Jazz with Sam to edit, and Mira's Summer 2026 with Robin to view.
  const sharedAt = tick();
  const linkToken = Buffer.from(random.derive("link").bytes(32)).toString("base64url");
  rows.shareLinks.push({
    id: ids.uuidv7(sharedAt),
    containerId: container(robinContainers, "Late night"),
    tokenHash: createHash("sha256").update(linkToken).digest(),
    ...stamps(sharedAt),
  });
  const grant = (containerId: string, grantee: DemoAccount, role: "view" | "edit") => {
    const at = tick();
    rows.shareGrants.push({
      id: ids.uuidv7(at),
      containerId,
      granteeId: grantee.id,
      invitedEmail: grantee.email,
      status: "accepted",
      role,
      emailStatus: "sent",
      acceptedAt: new Date(at),
      ...stamps(at),
    });
    // Accepting an invitation saves the reference (TS-33).
    rows.savedReferences.push({ viewerId: grantee.id, containerId, linkId: null, ...stamps(at) });
  };
  grant(container(robinContainers, "Jazz"), sam, "edit");
  grant(container(miraContainers, "Summer 2026"), owner, "view");

  if (clock > start + 300 * day) throw new Error("The demo's clock ran past its year");
  return { owner, friends: { mira, sam }, accounts: [owner, mira, sam], linkToken, rows };
}
