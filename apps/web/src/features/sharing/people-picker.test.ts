// The invite field's people (DS-65, FR-07.23; TON-294): those invited here left out, 8 before typing, matches by name or
// typed address in any spelling, and names shown twice.

import { describe, expect, test } from "bun:test";

import { uuidv7, type Person } from "@tonaris/domain";

import {
  clashingNames,
  findPeople,
  personChoices,
  suggestedPeople,
  theirsText,
  yoursText,
} from "./people-picker";

const person = (
  displayName: string | null,
  email: string | null = null,
  sharesWithYou: string | null = null,
): Person => ({
  id: uuidv7(),
  displayName,
  email,
  sharedAt: "2026-11-18T10:00:00.000Z",
  sharesWithYou,
  yours: { folders: 0, lists: 0, toEdit: 0 },
  theirs: { folders: 0, lists: 0 },
});

const names = (choices: readonly { name: string }[]) => choices.map((choice) => choice.name);

describe("people to invite (FR-07.23)", () => {
  test("those invited here aren't offered; the rest keep their order", () => {
    const anna = person("Anna", "anna@example.com");
    const ben = person("Ben");
    const carl = person(null, "carl@example.com");
    expect(names(personChoices([anna, ben, carl], [ben.id]))).toEqual(["Anna", "carl@example.com"]);
  });

  test("before typing, the latest 8, and how many more to find", () => {
    const many = Array.from({ length: 11 }, (_, at) => `Person ${at}`);
    const { shown, hidden } = suggestedPeople(
      personChoices(
        many.map((name) => person(name)),
        [],
      ),
    );
    expect(names(shown)).toEqual(many.slice(0, 8));
    expect(hidden).toBe(3);
  });

  test("typed words match the name or the address typed, in any spelling; whole names first", () => {
    const choices = personChoices(
      [
        person("Björk Guðmundsdóttir", "bjork@example.com"),
        person("Anna", "annab@example.com"),
        person("Hanna"),
        person("Ben", "ben@anna.example"),
      ],
      [],
    );
    expect(names(findPeople(choices, "bjork").shown)).toEqual(["Björk Guðmundsdóttir"]);
    expect(names(findPeople(choices, "BJÖRK gud").shown)).toEqual(["Björk Guðmundsdóttir"]);
    // "Anna" is the whole name; Hanna and Ben's address contain it.
    expect(names(findPeople(choices, "anna").shown)).toEqual(["Anna", "Hanna", "Ben"]);
    expect(findPeople(choices, "   ")).toEqual({ shown: [], total: 0 });
  });

  test("names shown twice, by people without an address only", () => {
    const shown = personChoices(
      [
        person("Anna", null, "Doom"),
        person("Anna", null, "Jazz"),
        person("Ben", "ben@example.com"),
        person("Ben", "ben@other.example"),
      ],
      [],
    );
    expect(clashingNames(shown)).toEqual(new Set(["Anna"]));
  });
});

describe("what a People row says (DS-121, TON-295)", () => {
  test("lists first, then folders, with those to edit; nothing for none", () => {
    expect(yoursText({ folders: 1, lists: 3, toEdit: 1 })).toBe(
      "You share 3 lists and 1 folder (1 to edit)",
    );
    expect(yoursText({ folders: 2, lists: 0, toEdit: 0 })).toBe("You share 2 folders");
    expect(yoursText({ folders: 0, lists: 0, toEdit: 0 })).toBeUndefined();
    expect(theirsText({ folders: 0, lists: 1 })).toBe("Shares 1 list with you");
    expect(theirsText({ folders: 1, lists: 2 })).toBe("Shares 2 lists and 1 folder with you");
    expect(theirsText({ folders: 0, lists: 0 })).toBeUndefined();
  });
});
