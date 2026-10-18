// The generated workload against TS-120, and the invariants the schema and domain rules expect of real data.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nameKey, searchKey } from "@tonaris/domain";

import { generateWorkload, referenceWorkload } from "./generate";
import { Random } from "./random";

const workload = generateWorkload();
const { owner, rows } = workload;
const ownedBy = (ownerId: string) => ({
  containers: rows.containers.filter((c) => c.ownerId === ownerId),
  albums: rows.albums.filter((a) => a.ownerId === ownerId),
  memberships: rows.memberships.filter((m) => m.ownerId === ownerId),
});
const owned = ownedBy(owner.id);
const containersById = new Map(rows.containers.map((c) => [c.id, c]));

function depth(id: string): number {
  let levels = 0;
  for (
    let c = containersById.get(id);
    c;
    c = c.parentId ? containersById.get(c.parentId) : undefined
  ) {
    levels++;
  }
  return levels;
}

const children = Map.groupBy(rows.containers, (c) => c.parentId);

/** Albums in lists at or below `containerId`: what sharing it shows (TS-31). */
function albumsUnder(containerId: string): Set<string> {
  const within = [containerId];
  for (const id of within) within.push(...(children.get(id) ?? []).map((c) => c.id));
  const ids = new Set(within);
  return new Set(rows.memberships.filter((m) => ids.has(m.listId)).map((m) => m.albumId));
}

describe("generateWorkload", () => {
  test("is deterministic", () => {
    expect(generateWorkload()).toEqual(workload);
    expect(generateWorkload({ ...referenceWorkload, seed: 7 }).owner.id).not.toBe(owner.id);
  });

  test("gives the owner 5,000 albums in 250 lists and 60 folders, at most 6 levels deep (TS-120)", () => {
    expect(owned.albums).toHaveLength(5_000);
    expect(owned.containers.filter((c) => c.kind === "list")).toHaveLength(250);
    expect(owned.containers.filter((c) => c.kind === "folder")).toHaveLength(60);
    expect(Math.max(...owned.containers.map((c) => depth(c.id)))).toBe(6);
  });

  test("puts albums in about 1.8 lists each, leaving some in Unsorted", () => {
    expect(owned.memberships.length / owned.albums.length).toBeCloseTo(1.8, 1);
    const inLists = new Set(owned.memberships.map((m) => m.albumId));
    expect(inLists.size).toBeLessThan(owned.albums.length);
  });

  test("defines 12 custom fields and applies them to about 40% of albums", () => {
    const fields = rows.fieldDefinitions.filter((f) => f.ownerId === owner.id);
    expect(fields).toHaveLength(12);
    const fieldIds = new Set(fields.map((f) => f.id));
    const withFields = new Set(
      rows.albumFieldValues.filter((v) => fieldIds.has(v.fieldId)).map((v) => v.albumId),
    );
    expect(withFields.size / owned.albums.length).toBeCloseTo(0.4, 1);
  });

  test("saves 3 collections from other people holding 5,000 albums in total", () => {
    const references = rows.savedReferences.filter((r) => r.viewerId === owner.id);
    expect(references).toHaveLength(3);
    const owners = references.map((r) => containersById.get(r.containerId)?.ownerId);
    expect(new Set(owners).size).toBe(3);
    expect(owners).not.toContain(owner.id);
    const shared = references.reduce((sum, r) => sum + albumsUnder(r.containerId).size, 0);
    expect(shared).toBe(5_000);
  });

  test("shares by accepted invitation or by a link whose token hashes to the stored hash (TS-32, TS-33)", () => {
    for (const share of workload.shares) {
      const reference = rows.savedReferences.find((r) => r.containerId === share.containerId);
      if (share.via === "invitation") {
        expect(reference?.linkId).toBeNull();
        expect(rows.shareGrants.find((g) => g.containerId === share.containerId)).toMatchObject({
          granteeId: owner.id,
          status: "accepted",
        });
      } else {
        const link = rows.shareLinks.find((l) => l.id === reference?.linkId);
        const hash = createHash("sha256")
          .update(share.token ?? "")
          .digest();
        expect(link?.tokenHash).toEqual(hash);
      }
    }
  });

  test("nests containers under folders of the same owner, with unique sibling names (X-06)", () => {
    const siblings = new Set<string>();
    for (const c of rows.containers) {
      if (c.parentId) {
        expect(containersById.get(c.parentId)).toMatchObject({
          kind: "folder",
          ownerId: c.ownerId,
        });
      }
      expect(c.nameKey).toBe(nameKey(c.name));
      const sibling = `${c.ownerId}/${c.parentId}/${c.nameKey}`;
      expect(siblings.has(sibling)).toBe(false);
      siblings.add(sibling);
    }
  });

  test("puts albums only in lists of their owner, once per list", () => {
    const albumOwners = new Map(rows.albums.map((a) => [a.id, a.ownerId]));
    const entries = new Set<string>();
    for (const m of rows.memberships) {
      expect(containersById.get(m.listId)).toMatchObject({ kind: "list", ownerId: m.ownerId });
      expect(albumOwners.get(m.albumId)).toBe(m.ownerId);
      entries.add(`${m.listId}/${m.albumId}`);
    }
    expect(entries.size).toBe(rows.memberships.length);
  });

  test("stores search keys, and the applicable year every album needs (TS-12, FR-02.6)", () => {
    for (const album of rows.albums) {
      expect(album.searchTitleKey).toBe(searchKey(album.title));
      expect(album.searchArtistKey).toBe(searchKey(album.artistCredit));
      const hasYear =
        album.originalYear != null || (album.isLive === true && album.recordingYearStart != null);
      expect(hasYear).toBe(true);
    }
  });

  test("gives every entity a unique UUIDv7 (TS-10)", () => {
    const ids = [rows.users, rows.containers, rows.albums, rows.fieldDefinitions, rows.fieldOptions]
      .flat()
      .map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
  });
});

describe("Random.uuidv7", () => {
  test("encodes the creation time, so IDs sort by it", () => {
    const ms = Date.UTC(2025, 5, 1, 12, 30);
    const id = new Random(1).uuidv7(ms);
    expect(Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(ms);
    expect(new Random(1).uuidv7(ms - 1) < id).toBe(true);
  });
});
