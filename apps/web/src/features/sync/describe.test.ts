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
  artworkUrl: null,
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

/** A capture of a Spotify link, proposing `albumId`. */
const capture = (albumId: string): Unsent => ({
  name: "album.capture",
  args: {
    albumId,
    link: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
    listId: null,
  },
});

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

  test("a capture is named by its album once saved, and as a link's album before", () => {
    expect(write(capture(blue.id)).summary).toBe("Add 'Kind of Blue'");
    expect(write(capture(uuidv7()))).toEqual({
      summary: "Add an album from open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
      what: "an album from open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
      subject: "An album from open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
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

  test("custom field types and options", () => {
    const fieldId = uuidv7();
    const calm = uuidv7();
    const withField: Names = {
      ...names,
      field: (id) => (id === fieldId ? "Mood" : undefined),
      option: (id) => (id === calm ? "Calm" : undefined),
    };
    const describeIt = (mutation: Unsent) =>
      describeWrite({ mutationId: uuidv7(), ...mutation }, withField).summary;
    expect(
      describeIt({
        name: "field.changeType",
        args: { id: fieldId, type: "multiple_choice" },
        base: { type: "single_choice" },
      }),
    ).toBe("Change 'Mood' to Multiple choice");
    expect(
      describeIt({ name: "field.addOption", args: { fieldId, id: uuidv7(), label: "Odd" } }),
    ).toBe("Add option 'Odd' to 'Mood'");
    expect(
      describeIt({
        name: "field.renameOption",
        args: { fieldId, optionId: calm, label: "Quiet" },
        base: { label: "Calm" },
      }),
    ).toBe("Rename option 'Calm' to 'Quiet'");
    expect(describeIt({ name: "field.removeOption", args: { fieldId, optionId: calm } })).toBe(
      "Remove option 'Calm' from 'Mood'",
    );
    expect(describeIt({ name: "field.delete", args: { id: fieldId, scopeHash: "hash" } })).toBe(
      "Delete field 'Mood'",
    );
  });

  test("custom fields on albums", () => {
    const fieldId = uuidv7();
    const withField: Names = { ...names, field: (id) => (id === fieldId ? "Rating" : undefined) };
    const args = { albumId: blue.id, fieldId };
    const describeIt = (mutation: Unsent) =>
      describeWrite({ mutationId: uuidv7(), ...mutation }, withField);
    expect(describeIt({ name: "fieldValue.apply", args }).summary).toBe(
      "Add 'Rating' to 'Kind of Blue'",
    );
    expect(
      describeIt({ name: "fieldValue.set", args: { ...args, value: "4" }, base: { value: null } }),
    ).toEqual({
      summary: "Set 'Rating' of 'Kind of Blue'",
      what: "the value of 'Rating' for 'Kind of Blue'",
      subject: "'Rating' of 'Kind of Blue'",
    });
    expect(describeIt({ name: "fieldValue.remove", args }).summary).toBe(
      "Remove 'Rating' from 'Kind of Blue'",
    );
    const optionNames: Names = { ...names, option: (id) => (id === "o1" ? "Calm" : undefined) };
    expect(fieldValue("value", ["o1", "o2"], optionNames)).toBe("Calm, An option");
    expect(fieldLabel("value")).toBe("Value");
  });

  test("custom fields", () => {
    const id = uuidv7();
    expect(
      write({
        name: "field.create",
        args: { id, name: "Mood", type: "single_choice", options: [] },
      }),
    ).toEqual({ summary: "New field 'Mood'", what: "the field 'Mood'", subject: "'Mood'" });
    expect(
      write({ name: "field.rename", args: { id, name: "Score" }, base: { name: "Rating" } }),
    ).toEqual({
      summary: "Rename field 'Rating' to 'Score'",
      what: "the new name for the field 'Rating'",
      subject: "The field 'Rating'",
    });
  });

  test("links", () => {
    const albumId = blue.id;
    expect(
      write({
        name: "link.set",
        args: { albumId, service: "spotify", url: "https://open.spotify.com/album/1" },
        base: { url: null },
      }),
    ).toEqual({
      summary: "Add the Spotify link to 'Kind of Blue'",
      what: "the Spotify link for 'Kind of Blue'",
      subject: "The Spotify link of 'Kind of Blue'",
    });
    expect(
      write({
        name: "link.set",
        args: { albumId, service: "apple-music", url: "https://music.apple.com/us/album/2" },
        base: { url: "https://music.apple.com/us/album/1" },
      }).summary,
    ).toBe("Replace the Apple Music link of 'Kind of Blue'");
    expect(
      write({
        name: "link.remove",
        args: { albumId, service: "tidal" },
        base: { url: "https://tidal.com/album/1" },
      }).summary,
    ).toBe("Remove the Tidal link from 'Kind of Blue'");
    expect(fieldLabel("url")).toBe("Link");
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

describe("view options (DS-49, DS-94)", () => {
  test("are named by their view, and defaults as the person's", () => {
    const choice = (viewKey: string) =>
      write({ name: "view.set", args: { viewKey, layout: "grid" }, base: { layout: null } });
    expect(choice(later.id)).toEqual({
      summary: "View options for 'Later'",
      what: "the view options for 'Later'",
      subject: "The view options for 'Later'",
    });
    expect(choice("root").summary).toBe("View options for Collection");
    expect(choice("unsorted").summary).toBe("View options for Unsorted");
    expect(choice(uuidv7()).summary).toBe("View options for a folder or list");
    expect(
      write({ name: "defaults.set", args: { grouped: true }, base: { grouped: false } }).summary,
    ).toBe("Default view options");
  });

  test("their fields and values read as the View options do", () => {
    expect(fieldLabel("sortMode")).toBe("Sort");
    expect(fieldLabel("folderSortDir")).toBe("Direction for folders");
    expect(fieldValue("sortMode", "year", names)).toBe("Year");
    expect(fieldValue("sortDir", "desc", names)).toBe("Descending");
    expect(fieldValue("sortMode", null, names)).toBe("Account default");
    expect(fieldValue("grouped", true, names)).toBe("Release type");
    expect(fieldValue("grouped", false, names)).toBe("None");
    expect(fieldValue("layout", "grid", names)).toBe("Grid");
    expect(fieldValue("listSortMode", "manual", names)).toBe("Manual");
  });
});

describe("manual order (DS-49)", () => {
  test("a move is named by its view, and a place by its item", () => {
    expect(
      write({
        name: "order.set",
        args: { viewKey: later.id, keys: { [blue.id]: "a0" } },
        base: { [blue.id]: null },
      }),
    ).toEqual({
      summary: "Arrange 'Later'",
      what: "the order of 'Later'",
      subject: "The order of 'Later'",
    });
    expect(fieldLabel(blue.id, names)).toBe("Place of 'Kind of Blue'");
    expect(fieldLabel(jazz.id, names)).toBe("Place of 'Jazz'");
    expect(fieldLabel(uuidv7())).toBe("Place of an item");
    expect(fieldValue(blue.id, "a0", names)).toBe("Placed elsewhere");
    expect(fieldValue(blue.id, "Zz", names, "attempted")).toBe("Your place");
    expect(fieldValue(blue.id, null, names)).toBe("Not arranged");
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
