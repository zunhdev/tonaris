import { describe, expect, test } from "bun:test";

import { accountSchema, emailKey, parseEmailAddress } from "./accounts";

describe("emailKey (TS-70)", () => {
  test("trims and lowercases", () => {
    expect(emailKey("  Creator@Example.COM \n")).toBe("creator@example.com");
  });

  test("converts an internationalized domain to ASCII", () => {
    expect(emailKey("Anna@Bücher.example")).toBe("anna@xn--bcher-kva.example");
    expect(emailKey("anna@xn--bcher-kva.example")).toBe("anna@xn--bcher-kva.example");
  });

  test("keeps plus-addresses and the local part as written", () => {
    expect(emailKey("Anna+Albums@example.com")).toBe("anna+albums@example.com");
    expect(emailKey("anna@example.com")).not.toBe(emailKey("anna+albums@example.com"));
  });

  test("leaves values that aren't addresses for validation to reject", () => {
    expect(emailKey("Not An Email")).toBe("not an email");
    expect(emailKey("x@évil.example/y")).toBe("x@évil.example/y");
  });
});

describe("parseEmailAddress (TS-70)", () => {
  test("answers an address's email key", () => {
    expect(parseEmailAddress("  Anna@Bücher.example ")).toBe("anna@xn--bcher-kva.example");
    expect(parseEmailAddress("anna+albums@example.com")).toBe("anna+albums@example.com");
  });

  test("answers nothing for what isn't an address", () => {
    expect(parseEmailAddress("Not An Email")).toBeUndefined();
    expect(parseEmailAddress("x@évil.example/y")).toBeUndefined();
    expect(parseEmailAddress("")).toBeUndefined();
  });
});

describe("accountSchema", () => {
  test("accepts an account without a display name", () => {
    const account = {
      id: "01a14f81-7851-73f1-9848-821fb3927b02",
      email: "creator@example.com",
      displayName: null,
      role: "creator",
      termsAgreed: false,
    } as const;
    expect(accountSchema.parse(account)).toEqual(account);
  });

  test("rejects an unknown role", () => {
    expect(
      accountSchema.safeParse({
        id: "01a14f81-7851-73f1-9848-821fb3927b02",
        email: "a@example.com",
        displayName: "A",
        role: "admin",
      }).success,
    ).toBe(false);
  });
});
