import { expect, test } from "bun:test";

import { hasSessionCookie } from "./session-cookie";

test("a session cookie is found by either of its names, among others", () => {
  expect(hasSessionCookie("__Secure-tonaris.session_token=abc.def")).toBe(true);
  expect(hasSessionCookie("tonaris.session_token=abc.def")).toBe(true);
  expect(hasSessionCookie("theme=dark; __Secure-tonaris.session_token=abc; other=1")).toBe(true);
  expect(hasSessionCookie("theme=dark;tonaris.session_token=abc")).toBe(true);
});

test("no cookie, an empty one or a look-alike isn't a session", () => {
  expect(hasSessionCookie(null)).toBe(false);
  expect(hasSessionCookie("")).toBe(false);
  expect(hasSessionCookie("__Secure-tonaris.session_token=")).toBe(false);
  expect(hasSessionCookie("__Secure-tonaris.session_token=; theme=dark")).toBe(false);
  expect(hasSessionCookie("xtonaris.session_token=abc")).toBe(false);
  expect(hasSessionCookie("__Secure-tonaris.session_data=abc")).toBe(false);
});
