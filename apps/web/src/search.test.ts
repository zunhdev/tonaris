import { expect, test } from "bun:test";

import { uuidv7 } from "@tonaris/domain";

import { uuidSearch } from "./search";

test("a route's search keeps its ID and drops anything else", () => {
  const album = uuidv7();
  const validate = uuidSearch("album");
  expect(validate({ album, other: "x" })).toEqual({ album });
  expect(validate({ album: "not-an-id" })).toEqual({});
  expect(validate({ album: 42 })).toEqual({});
  expect(validate({})).toEqual({});
});
