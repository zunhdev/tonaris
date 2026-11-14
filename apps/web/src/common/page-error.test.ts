// What a page that can't be shown says (DRIFT-081): a refusal isn't "Couldn't reach Tonaris", and a bug isn't either.

import { describe, expect, test } from "bun:test";

import { LoadError, loadOrThrow, pageErrorText } from "./page-error";

describe("pageErrorText", () => {
  test("no answer or a server error is unreachable; a refusal isn't available; a bug went wrong", () => {
    expect(pageErrorText(new LoadError(503, "the members"))).toMatchObject({
      title: "Couldn't reach Tonaris",
      retry: true,
    });
    expect(pageErrorText(new TypeError("Failed to fetch")).title).toBe("Couldn't reach Tonaris");
    expect(pageErrorText(new LoadError(403, "the members"))).toMatchObject({
      title: "Not available",
      retry: false,
    });
    expect(pageErrorText(new Error("x is undefined")).title).toBe("Something went wrong");
  });

  test("a loader keeps the answer's status", () => {
    expect(loadOrThrow({ data: 1, status: 200 }, "it")).toBe(1);
    expect(() => loadOrThrow({ data: null, status: 500 }, "it")).toThrow(LoadError);
  });
});
