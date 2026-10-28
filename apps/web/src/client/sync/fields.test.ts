// The writes a field's update becomes (TON-51): its name, its type, and its options removed, renamed and added, in that
// order, a removal carrying its confirmed scope hash.

import { describe, expect, test } from "bun:test";

import { uuidv7, type CustomField } from "@tonaris/domain";

import { fieldWrites } from "./fields";

const [calm, loud, odd] = [uuidv7(), uuidv7(), uuidv7()];
const mood: CustomField = {
  id: uuidv7(),
  name: "Mood",
  type: "single_choice",
  options: [
    { id: calm, label: "Calm" },
    { id: loud, label: "Loud" },
  ],
};

describe("field writes (FR-03.11 to FR-03.17)", () => {
  test("an update becomes a rename, a type change, and option removals, renames and additions", () => {
    const writes = fieldWrites(
      mood,
      {
        id: mood.id,
        name: "Feel",
        type: "multiple_choice",
        options: [
          { id: loud, label: "Calm" },
          { id: odd, label: "Odd" },
        ],
      },
      { confirmed: { [calm]: "hash" } },
    );
    expect(writes.map(({ name, args }) => ({ name, args }))).toEqual([
      { name: "field.rename", args: { id: mood.id, name: "Feel" } },
      { name: "field.changeType", args: { id: mood.id, type: "multiple_choice" } },
      { name: "field.removeOption", args: { fieldId: mood.id, optionId: calm, scopeHash: "hash" } },
      { name: "field.renameOption", args: { fieldId: mood.id, optionId: loud, label: "Calm" } },
      { name: "field.addOption", args: { fieldId: mood.id, id: odd, label: "Odd" } },
    ]);
    expect(writes[1]).toMatchObject({ base: { type: "single_choice" } });
    expect(writes[3]).toMatchObject({ base: { label: "Loud" } });
  });

  test("a removal without a confirmation sends no hash, and an unchanged field sends nothing", () => {
    const [removal] = fieldWrites(mood, { ...mood, options: [{ id: loud, label: "Loud" }] });
    expect(removal).toMatchObject({ name: "field.removeOption", args: { optionId: calm } });
    expect(removal?.args).not.toHaveProperty("scopeHash");
    expect(fieldWrites(mood, { ...mood })).toEqual([]);
  });
});
