import { describe, expect, test } from "bun:test";

import {
  albumDeletionScope,
  approvalConsequences,
  approvalState,
  approvalSummary,
  canonicalJson,
  fieldDeletionApprovalScope,
  itemsDeletionScope,
  matchScope,
  optionsRemovalScope,
  scopeHash,
} from "./approvals";
import { deletionImpact } from "./sharing-impact";

const a = "01a15f00-0000-7000-8000-00000000000a";
const b = "01a15f00-0000-7000-8000-00000000000b";
const list1 = "01a15f00-0000-7000-8000-0000000000c1";
const list2 = "01a15f00-0000-7000-8000-0000000000c2";

const album = (id: string, lists: { id: string; name: string }[] = []) => ({
  id,
  title: `Title ${id.slice(-1)}`,
  artist: "Someone",
  lists,
});

describe("the scope of a gated operation (TS-64)", () => {
  test("is canonical: the same deletion hashes the same whatever the order", async () => {
    const one = albumDeletionScope([
      album(b, [
        { id: list2, name: "Two" },
        { id: list1, name: "One" },
      ]),
      album(a),
    ]);
    const other = albumDeletionScope([
      album(a),
      album(b, [
        { id: list1, name: "One" },
        { id: list2, name: "Two" },
      ]),
    ]);
    expect(one).toEqual(other);
    expect(await scopeHash(one)).toBe(await scopeHash(other));
    expect(await scopeHash(one)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("hashes differently once an album leaves one more list", async () => {
    const before = albumDeletionScope([album(a, [{ id: list1, name: "One" }])]);
    const grown = albumDeletionScope([
      album(a, [
        { id: list1, name: "One" },
        { id: list2, name: "Two" },
      ]),
    ]);
    expect(await scopeHash(grown)).not.toBe(await scopeHash(before));
  });

  test("canonical JSON sorts keys at every level and keeps array order", () => {
    expect(canonicalJson({ b: [{ y: 1, x: 2 }], a: "s", c: undefined })).toBe(
      '{"a":"s","b":[{"x":2,"y":1}]}',
    );
  });
});

describe("the approval page's words (DS-87)", () => {
  test("say what moves to Trash, which lists it leaves, and for how long it can be recovered", () => {
    const scope = albumDeletionScope([
      album(a, [{ id: list1, name: "One" }]),
      album(b, [
        { id: list1, name: "One" },
        { id: list2, name: "Two" },
      ]),
    ]);
    expect(approvalSummary(scope)).toBe("Move 2 albums to Trash");
    expect(approvalConsequences(scope)).toEqual([
      "They leave 2 lists and Unsorted.",
      "They can be recovered from Trash for 30 days.",
    ]);
    expect(approvalSummary(albumDeletionScope([album(a)]))).toBe("Move 1 album to Trash");
  });
});

describe("an approval's state", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const later = new Date("2026-10-21T12:30:00Z");
  const earlier = new Date("2026-10-21T11:30:00Z");

  test("is pending or approved until it expires, approved ones included", () => {
    expect(approvalState({ status: "pending", expiresAt: later }, now)).toBe("pending");
    expect(approvalState({ status: "approved", expiresAt: later }, now)).toBe("approved");
    expect(approvalState({ status: "pending", expiresAt: earlier }, now)).toBe("expired");
    expect(approvalState({ status: "approved", expiresAt: earlier }, now)).toBe("expired");
  });

  test("stays declined or used after the expiry", () => {
    expect(approvalState({ status: "declined", expiresAt: earlier }, now)).toBe("declined");
    expect(approvalState({ status: "used", expiresAt: earlier }, now)).toBe("used");
  });
});

describe("each gated operation's words (DS-87, FR-10.6)", () => {
  const folder = "01a15f00-0000-7000-8000-0000000000f1";
  const field = {
    id: "01a15f00-0000-7000-8000-0000000000e1",
    name: "Format",
    type: "single_choice" as const,
  };

  test("deleting folders, lists and albums names each, with Unsorted and who no longer sees it", () => {
    const scope = itemsDeletionScope({
      albums: [album(a, [{ id: list1, name: "One" }])],
      containers: [
        { id: folder, kind: "folder", name: "Metal", folders: 1, lists: 12 },
        { id: list2, kind: "list", name: "Two", folders: 0, lists: 0 },
      ],
      unsorted: 3,
      sharing: [
        { kind: "person", id: b, name: "Anna", pending: false, via: { id: folder, name: "Metal" } },
        { kind: "link", via: { id: folder, name: "Metal" } },
      ],
    });
    expect(approvalSummary(scope)).toBe(
      "Move 1 list, 1 folder (12 lists inside) and 1 album to Trash",
    );
    expect(approvalConsequences(scope)).toEqual([
      "Albums in them stay in the collection: 3 albums are in no other list, so go to Unsorted.",
      "The albums leave 1 list and Unsorted.",
      "1 person it's shared with and anyone with its link will no longer see it.",
      "Everything can be recovered from Trash for 30 days.",
    ]);
  });

  test("deleting a field and removing options can't be undone", () => {
    const deletion = fieldDeletionApprovalScope({
      field,
      options: [],
      albums: 10,
      inTrash: 2,
      scopeHash: "x",
    });
    expect(approvalSummary(deletion)).toBe('Delete the field "Format" for good');
    expect(approvalConsequences(deletion)).toEqual([
      "It is taken off 12 albums, 2 of them in Trash, with its values.",
      "This can't be undone.",
    ]);
    const removal = optionsRemovalScope(field, [
      {
        field: { id: field.id, name: field.name },
        option: { id: b, label: "CD" },
        albums: 1,
        inTrash: 0,
        scopeHash: "y",
      },
    ]);
    expect(approvalSummary(removal)).toBe('Remove the option "CD" from "Format"');
    expect(approvalConsequences(removal)).toEqual([
      "It is cleared from 1 album.",
      "This can't be undone.",
    ]);
  });

  test("confirming a match says whether it joins a saved album", () => {
    const match = {
      link: "https://music.apple.com/us/album/1",
      releaseGroupId: a,
      title: "Bleach",
      listId: null,
      listName: null,
    };
    expect(approvalConsequences(matchScope(match, undefined))).toEqual([
      "It is saved as a new album with this link.",
    ]);
    expect(approvalConsequences(matchScope(match, album(b)))).toEqual([
      'It is "Title b" by Someone, already in your collection: the link is added to it.',
    ]);
  });
});

describe("deletion's sharing effects (FR-07.14)", () => {
  test("everyone who sees a deleted list, through it or its folders, stops; others' lists are untouched", () => {
    const state = {
      containers: [
        { id: "f", parentId: null, name: "Metal", trashed: false },
        { id: "l", parentId: "f", name: "Doom", trashed: false },
        { id: "o", parentId: null, name: "Other", trashed: false },
      ],
      people: [
        { containerId: "f", personId: "anna", name: "Anna", pending: false },
        { containerId: "o", personId: "ben", name: "Ben", pending: false },
      ],
      links: [{ containerId: "l" }],
    };
    expect(deletionImpact(state, { containerIds: ["l"], albumListIds: [] })).toEqual([
      { kind: "link", via: { id: "l", name: "Doom" } },
      { kind: "person", id: "anna", name: "Anna", pending: false, via: { id: "f", name: "Metal" } },
    ]);
    expect(deletionImpact(state, { containerIds: [], albumListIds: ["o"] })).toEqual([
      { kind: "person", id: "ben", name: "Ben", pending: false, via: { id: "o", name: "Other" } },
    ]);
  });
});
