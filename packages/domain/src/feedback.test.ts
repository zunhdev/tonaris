import { describe, expect, test } from "bun:test";

import { feedbackProviderKey, feedbackSignInUrl } from "./feedback";

const callback = "https://login.fider.io/oauth/_k3j9x0q2ab/callback";

describe("feedbackProviderKey", () => {
  test("reads the key from Fider's callback URL", () => {
    expect(feedbackProviderKey(callback)).toBe("_k3j9x0q2ab");
    expect(feedbackProviderKey("https://feedback.tonaris.app/oauth/_abc123/callback")).toBe(
      "_abc123",
    );
  });

  test("refuses anything else", () => {
    for (const url of [
      "not a url",
      "https://login.fider.io/oauth/google/callback",
      "https://login.fider.io/oauth/_abc/callback?x=1",
      "https://login.fider.io/oauth/_abc",
      "https://login.fider.io/oauth/_ABC/callback",
    ]) {
      expect(feedbackProviderKey(url)).toBeUndefined();
    }
  });
});

describe("feedbackSignInUrl", () => {
  test("opens the board through Tonaris's provider, back to its front page by its full address", () => {
    // Fider refuses a bare path with 403 (TON-145).
    expect(feedbackSignInUrl("https://feedback.tonaris.app/", callback)).toBe(
      "https://feedback.tonaris.app/oauth/_k3j9x0q2ab?redirect=https%3A%2F%2Ffeedback.tonaris.app%2F",
    );
  });

  test("is undefined until both are set and valid", () => {
    expect(feedbackSignInUrl(undefined, callback)).toBeUndefined();
    expect(feedbackSignInUrl("https://feedback.tonaris.app", undefined)).toBeUndefined();
    expect(feedbackSignInUrl("feedback.tonaris.app", callback)).toBeUndefined();
    expect(feedbackSignInUrl("javascript:alert(1)", callback)).toBeUndefined();
    expect(
      feedbackSignInUrl("https://feedback.tonaris.app", "https://login.fider.io/"),
    ).toBeUndefined();
  });
});
