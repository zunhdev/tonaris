import { describe, expect, test } from "bun:test";

import { codeMissing, isSpentLink, resendLabel } from "./code-entry";

describe("the emailed code's words and links (DS-90, DS-91)", () => {
  test("a short code asks for all six digits", () => {
    expect(codeMissing).toBe("Enter the 6-digit code from the email.");
  });

  test("the resend button counts down, then offers a new code", () => {
    expect(resendLabel(30)).toBe("Resend code in 30s");
    expect(resendLabel(1)).toBe("Resend code in 1s");
    expect(resendLabel(0)).toBe("Resend code");
  });

  test("a link's code is spent when wrong, expired or tried too often, not when unreachable", () => {
    expect(isSpentLink({ reason: "wrong_code" })).toBe(true);
    expect(isSpentLink({ reason: "expired" })).toBe(true);
    expect(isSpentLink({ reason: "too_many_attempts" })).toBe(true);
    expect(isSpentLink({ reason: "unreachable" })).toBe(false);
    expect(isSpentLink({ reason: "refused", detail: "This invitation has expired." })).toBe(false);
  });
});
