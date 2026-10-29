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

  test("the invitation links to its landing page, for this address only, for 14 days (FR-11.6)", () => {
    const link = "https://tonaris.example/join/abc";
    const { subject, text } = renderEmail("admission-invitation", { link });
    expect(subject).toBe("You're invited to join Tonaris");
    expect(text).toContain(`\n${link}\n`);
    expect(text).toContain("only for this address, and expires in 14 days");
  });
});

describe("email change and recovery (TS-73, DS-93)", () => {
  test("the current address gets a code naming the new one; the new address gets its own", () => {
    const current = renderEmail("email-change-current", {
      code: "123456",
      newEmail: "anna@new.example",
    });
    expect(current.subject).toBe("Your code to change your Tonaris sign-in email");
    expect(current.text).toContain("to anna@new.example");
    expect(current.text).toContain("\n123456\n");
    expect(current.text).toContain("your sign-in email stays the same");

    const next = renderEmail("email-change-new", { code: "654321" });
    expect(next.subject).toBe("Your code to confirm your new Tonaris sign-in email");
    expect(next.text).toContain("\n654321\n");
  });

  test("recovery's email carries the code and the link, and says the old address stops working", () => {
    const link = "https://tonaris.example/recover#code=123456";
    const { subject, text } = renderEmail("recovery-verification", { code: "123456", link });
    expect(subject).toBe("Confirm your new Tonaris sign-in email");
    expect(text).toContain("\n123456\n");
    expect(text).toContain(link);
    expect(text).toContain("your old address stops working");
  });
});
