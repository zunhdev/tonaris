import { describe, expect, test } from "bun:test";

import { errorCodes, failure } from "@tonaris/domain";

import { problemSentence } from "./problems";

describe("problemSentence (FR-13.1, DS-107)", () => {
  test("a problem says its detail, or the fallback without one", () => {
    const { problem } = failure("name_conflict", "'Later' already exists at the top level.");
    expect(problemSentence(problem, "Try again.")).toBe("'Later' already exists at the top level.");
    expect(problemSentence({ ...problem, detail: undefined }, "Try again.")).toBe("Try again.");
    expect(problemSentence({ ...problem, detail: "" }, "Try again.")).toBe("Try again.");
    expect(problemSentence(undefined, "Try again.")).toBe("Try again.");
  });

  test("every code has its own sentence", () => {
    for (const code of errorCodes) expect(problemSentence(code, "")).not.toBe("");
    expect(problemSentence("name_conflict", "Try again.")).toBe(
      "That name is already used here. Choose another name.",
    );
  });
});
