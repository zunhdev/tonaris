// How each write is named in Activity, toasts and the review (DS-80, DS-81, DS-107).

import { describe, expect, test } from "bun:test";

import {
  errorCodes,
  failure,
  uuidv7,
  type Album,
  type Container,
  type Mutation,
} from "@tonaris/domain";

import { describeWrite, fieldLabel, fieldValue, reasonOf, type Names } from "./describe";

const blue: Album = {
  id: uuidv7(),
  title: "Kind of Blue",
  artistCredit: "Miles Davis",
  releaseType: "album",
  isLive: false,
  originalYear: 1959,
  recordingYearStart: null,
  recordingYearEnd: null,
};
const jazz: Container = { id: uuidv7(), kind: "folder", parentId: null, name: "Jazz" };
const later: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Later" };

const names: Names = {
  album: (id) => (id === blue.id ? blue.title : undefined),
  container: (id) => [jazz, later].find((each) => each.id === id),
};

/** A mutation without its ID, for each mutation name. */
type Unsent = Mutation extends infer Each
  ? Each extends Mutation
    ? Omit<Each, "mutationId">
    : never
  : never;

const write = (mutation: Unsent) => describeWrite({ mutationId: uuidv7(), ...mutation }, names);

describe("describeWrite (DS-80, DS-81)", () => {
  test("albums", () => {
    expect(write({ name: "album.create", args: blue })).toEqual({
      summary: "Add 'Kind of Blue'",
      what: "'Kind of Blue'",
      subject: "'Kind of Blue'",
    });
    expect(
      write({ name: "album.update", args: { id: blue.id, title: "B" }, base: { title: "A" } }),
    ).toEqual({ summary: "Edit 'A'", what: "changes to 'A'", subject: "'A'" });
    expect(
      write({
        name: "album.update",
        args: { id: blue.id, originalYear: 1960 },
        base: { originalYear: 1959 },
      }),
    ).toEqual({
      summary: "Edit 'Kind of Blue'",
      what: "changes to 'Kind of Blue'",
      subject: "'Kind of Blue'",
    });
  });

  test("a rolled-back record is named from the write itself", () => {
    const soon: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Soon" };
    expect(write({ name: "container.create", args: soon })).toEqual({
      summary: "New list 'Soon'",
      what: "the list 'Soon'",
      subject: "'Soon'",
    });
    expect(
      write({ name: "album.create", args: { ...blue, id: uuidv7(), title: "Giant Steps" } }).what,
    ).toBe("'Giant Steps'");
  });

  test("folders and lists", () => {
    expect(
      write({
        name: "container.rename",
        args: { id: later.id, name: "Soon" },
        base: { name: "Later" },
      }),
    ).toEqual({
      summary: "Rename 'Later' to 'Soon'",
      what: "the new name for the list 'Later'",
      subject: "'Later'",
    });
    expect(
      write({
        name: "container.move",
        args: { id: later.id, parentId: jazz.id },
        base: { parentId: null },
      }),
    ).toEqual({
      summary: "Move 'Later' to 'Jazz'",
      what: "the move of the list 'Later'",
      subject: "'Later'",
    });
    expect(
      write({
        name: "container.move",
        args: { id: later.id, parentId: null },
        base: { parentId: jazz.id },
      }).summary,
    ).toBe("Move 'Later' to Collection");
  });

  test("list entries", () => {
    const args = { listId: later.id, albumId: blue.id };
    expect(write({ name: "membership.add", args })).toEqual({
      summary: "Add 'Kind of Blue' to 'Later'",
      what: "'Kind of Blue' in 'Later'",
      subject: "'Kind of Blue' in 'Later'",
    });
    expect(write({ name: "membership.remove", args }).summary).toBe(
      "Remove 'Kind of Blue' from 'Later'",
    );
    expect(
      write({ name: "membership.add", args: { listId: uuidv7(), albumId: uuidv7() } }).subject,
    ).toBe("An album in a list");
  });
});

describe("fields and reasons (DS-80, DS-107)", () => {
  test("values read as people would write them", () => {
    expect(fieldLabel("artistCredit")).toBe("Artist");
    expect(fieldValue("title", "Kind of Blue", names)).toBe("Kind of Blue");
    expect(fieldValue("recordingYearStart", null, names)).toBe("—");
    expect(fieldValue("isLive", true, names)).toBe("Yes");
    expect(fieldValue("releaseType", "ep", names)).toBe("EP");
    expect(fieldValue("parentId", jazz.id, names)).toBe("Jazz");
    expect(fieldValue("parentId", null, names)).toBe("Collection");
  });

  test("a failure's reason is the server's explanation", () => {
    expect(reasonOf(failure("name_conflict", "'Later' already exists in Collection."))).toBe(
      "'Later' already exists in Collection.",
    );
    expect(reasonOf(undefined)).toBe("Tonaris couldn't save this change. Try again.");
  });

  test("without an explanation, every code has a plain reason with a way forward (DS-107)", () => {
    for (const code of errorCodes) {
      const { problem } = failure(code, "");
      const reason = reasonOf({
        status: "failed",
        code,
        problem: { ...problem, detail: undefined },
      });
      expect(reason).not.toMatch(/error|oops|!/i);
      expect(reason).not.toContain(code);
      expect(reason).toMatch(/^[A-Z].*\.$/);
    }
    const { problem } = failure("rate_limited", "");
    expect(
      reasonOf({
        status: "failed",
        code: "rate_limited",
        problem: { ...problem, detail: undefined },
      }),
    ).toBe("Too many changes at once. Wait a moment, then retry.");
  });
});
