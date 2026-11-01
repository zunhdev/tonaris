// A new field's problems as New field shows them (FR-03.6, FR-03.10): the domain's, each at its field or option row.

import { describe, expect, test } from "bun:test";

import { maxFields, uuidv7, type CustomField } from "@tonaris/domain";

import { newFieldProblems } from "./field-create-dialog";

const option = (label: string) => ({ id: uuidv7(), label });
const field = (name: string): CustomField => ({ id: uuidv7(), name, type: "text", options: [] });

describe("New field's problems (FR-03.10)", () => {
  test("an option's problem shows at its own row, rows left empty skipped", () => {
    const problems = newFieldProblems(
      "Mood",
      "single_choice",
      [option("Calm"), option(""), option("calm"), option("  ")],
      [],
    );
    expect(problems).toEqual({ options: { 2: "Each option needs its own label." } });
  });

  test("the name's problem, and the limit's at the form", () => {
    const fields = Array.from({ length: maxFields }, (_, index) => field(`Field ${index}`));
    const problems = newFieldProblems(" field 0 ", "text", [], fields);
    expect(problems.name).toBeDefined();
    expect(problems.form).toBe(
      `You've reached ${maxFields} custom fields. Delete one to add another.`,
    );
    expect(newFieldProblems("", "text", [], []).name).toBeDefined();
  });
});
