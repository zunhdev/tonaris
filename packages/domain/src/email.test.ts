import { describe, expect, test } from "bun:test";

import { renderEmail } from "./email";

describe("sign-in emails (TS-70, DS-90)", () => {
  test("the code email carries the code and the link", () => {
    const link = "https://tonaris.example/sign-in/verify?email=a%40example.com#code=123456";
    const { subject, text } = renderEmail("sign-in-code", { code: "123456", link });
    // The code stays out of the subject, which lock screens and notifications show.
    expect(subject).toBe("Your Tonaris sign-in code");
    expect(text).toContain("\n123456\n");
    expect(text).toContain(link);
    expect(text).toContain("expires in 10 minutes");
  });

  test("the no-account email carries neither a code nor a link", () => {
    const { subject, text } = renderEmail("sign-in-no-account", {});
    expect(subject).toBe("Signing in to Tonaris");
    expect(text).toContain("there is no Tonaris account for it");
    expect(text).not.toMatch(/\d{6}/);
    expect(text).not.toContain("http");
  });
});

describe("admission emails (TS-71, DS-91)", () => {
  test("the join code email carries the code and the invitation page's link", () => {
    const link = "https://tonaris.example/join/abc#code=123456";
    const { subject, text } = renderEmail("join-code", { code: "123456", link });
    expect(subject).toBe("Your code to join Tonaris");
    expect(text).toContain("\n123456\n");
    expect(text).toContain(link);
    expect(text).toContain("expires in 10 minutes");
  });
});
