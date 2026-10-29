import { describe, expect, test } from "bun:test";

import {
  authFailure,
  authFailureMessage,
  requestSignInCode,
  signInWithCode,
  signOut,
} from "./auth-client";
import { forgetSignIn, pendingSignIn, rememberSignIn } from "./pending-sign-in";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  test("keeps paths inside the app", () => {
    expect(safeRedirect("/c")).toBe("/c");
    expect(safeRedirect("/l/01a14f81?album=2#top")).toBe("/l/01a14f81?album=2#top");
  });

  test("lands on the collection for anything else", () => {
    for (const value of [
      undefined,
      "",
      "c",
      "https://evil.example/c",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/sign-in",
      "/sign-in/verify?email=a",
      42,
    ]) {
      expect(safeRedirect(value)).toBe("/c");
    }
  });
});

describe("authFailure", () => {
  test("reads Better Auth's codes", () => {
    expect(authFailure(400, { message: "Invalid OTP", code: "INVALID_OTP" }, null)).toEqual({
      reason: "wrong_code",
    });
    expect(authFailure(400, { code: "OTP_EXPIRED" }, null)).toEqual({ reason: "expired" });
    expect(authFailure(403, { code: "TOO_MANY_ATTEMPTS" }, null)).toEqual({
      reason: "too_many_attempts",
    });
    expect(authFailure(400, { code: "INVALID_EMAIL" }, null)).toEqual({ reason: "invalid_email" });
    expect(authFailure(500, undefined, null)).toEqual({ reason: "unknown" });
  });

  test("reads the sign-in limits' problem and its Retry-After", () => {
    const problem = { type: "about:blank", status: 429, code: "rate_limited" };
    expect(authFailure(429, problem, "600")).toEqual({
      reason: "rate_limited",
      retryAfterSeconds: 600,
    });
    expect(authFailure(429, problem, null)).toEqual({
      reason: "rate_limited",
      retryAfterSeconds: 60,
    });
  });

  test("reads an invitation's refusal and says its sentence (DS-91)", () => {
    const withdrawn = {
      type: "about:blank",
      status: 403,
      code: "permission_denied",
      detail: "This invitation has been withdrawn.",
    };
    const refused = authFailure(403, withdrawn, null);
    expect(refused).toEqual({ reason: "refused", detail: "This invitation has been withdrawn." });
    expect(authFailureMessage(refused)).toBe("This invitation has been withdrawn.");
    expect(
      authFailure(410, { code: "expired", detail: "This invitation has expired." }, null),
    ).toEqual({
      reason: "refused",
      detail: "This invitation has expired.",
    });
    // A code's error stays the code's, and a server failure isn't a refusal.
    expect(authFailure(403, { code: "TOO_MANY_ATTEMPTS", detail: "x" }, null)).toEqual({
      reason: "too_many_attempts",
    });
    expect(authFailure(500, { detail: "Broke" }, null)).toEqual({ reason: "unknown" });
  });

  test("says when to try again, in minutes", () => {
    expect(authFailureMessage({ reason: "rate_limited", retryAfterSeconds: 600 })).toBe(
      "Too many sign-in attempts. Try again in 10 minutes.",
    );
    expect(authFailureMessage({ reason: "rate_limited", retryAfterSeconds: 30 })).toBe(
      "Too many sign-in attempts. Try again in 1 minute.",
    );
  });
});

/** A fetch that answers `response` and records each call. */
function recordingFetch(response: Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
      return Promise.resolve(response.clone());
    },
    { preconnect: fetch.preconnect },
  );
  return { calls, fetcher };
}

describe("auth calls", () => {
  test("post JSON with the session cookie to the API's /auth endpoints", async () => {
    const { calls, fetcher } = recordingFetch(Response.json({ success: true }));
    expect(await requestSignInCode("anna@example.com", fetcher)).toEqual({ ok: true });
    expect(await signInWithCode("anna@example.com", "123456", fetcher)).toEqual({ ok: true });
    expect(await signOut(fetcher)).toEqual({ ok: true });

    expect(calls.map(({ url }) => url)).toEqual([
      "http://localhost:3001/auth/email-otp/send-verification-otp",
      "http://localhost:3001/auth/sign-in/email-otp",
      "http://localhost:3001/auth/sign-out",
    ]);
    expect(calls.map(({ init }) => init?.body)).toEqual([
      JSON.stringify({ email: "anna@example.com", type: "sign-in" }),
      JSON.stringify({ email: "anna@example.com", otp: "123456" }),
      "{}",
    ]);
    for (const { init } of calls) {
      expect(init).toMatchObject({ method: "POST", credentials: "include" });
    }
  });

  test("report a refusal and an unreachable API", async () => {
    const { fetcher } = recordingFetch(Response.json({ code: "INVALID_OTP" }, { status: 400 }));
    expect(await signInWithCode("anna@example.com", "000000", fetcher)).toEqual({
      ok: false,
      reason: "wrong_code",
    });
    const offline: typeof fetch = Object.assign(() => Promise.reject(new TypeError("offline")), {
      preconnect: fetch.preconnect,
    });
    expect(await requestSignInCode("anna@example.com", offline)).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});

describe("pending sign-in", () => {
  class MemoryStorage implements Storage {
    readonly #items = new Map<string, string>();
    get length() {
      return this.#items.size;
    }
    clear() {
      this.#items.clear();
    }
    getItem(key: string) {
      return this.#items.get(key) ?? null;
    }
    key(index: number) {
      return [...this.#items.keys()][index] ?? null;
    }
    removeItem(key: string) {
      this.#items.delete(key);
    }
    setItem(key: string, value: string) {
      this.#items.set(key, value);
    }
  }

  test("is found for the same email while a code can be valid", () => {
    const store = new MemoryStorage();
    const at = Date.UTC(2026, 9, 18, 12);
    rememberSignIn("anna@example.com", "/l/1", store, at);

    expect(pendingSignIn("anna@example.com", store, at + 60_000)).toEqual({
      email: "anna@example.com",
      redirect: "/l/1",
      at,
    });
    expect(pendingSignIn("ben@example.com", store, at)).toBeUndefined();
    expect(pendingSignIn("anna@example.com", store, at + 11 * 60_000)).toBeUndefined();

    forgetSignIn(store);
    expect(pendingSignIn("anna@example.com", store, at)).toBeUndefined();
  });

  test("ignores what it can't read, and works without storage", () => {
    const store = new MemoryStorage();
    store.setItem("tonaris.pending-sign-in", "{not json");
    expect(pendingSignIn("anna@example.com", store)).toBeUndefined();
    expect(() => rememberSignIn("anna@example.com", "/c", undefined)).not.toThrow();
    expect(pendingSignIn("anna@example.com", undefined)).toBeUndefined();
  });
});
