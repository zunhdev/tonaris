// The Resend adapter (TS-72) against a stand-in for Resend's API: the request it sends, and which failures are worth
// retrying.

import { describe, expect, test } from "bun:test";

import { EmailDeliveryError } from "@tonaris/domain";
import { SafeFetchError, type SafeFetchInit } from "@tonaris/providers";

import { resendEmail, resendEndpoint } from "./resend";

type Call = { url: string; init: SafeFetchInit };

/** Resend answering `status` with `body`, or failing like `safeFetch` with `error`. */
function resend(answer: { status: number; body?: unknown } | { error: Error }) {
  const calls: Call[] = [];
  const port = resendEmail({
    apiKey: "re_test_key",
    emailFrom: "Tonaris <no-reply@mail.tonaris.app>",
    async fetch(url, init) {
      calls.push({ url, init });
      if ("error" in answer) throw answer.error;
      return Response.json(answer.body ?? {}, { status: answer.status });
    },
  });
  return { port, calls };
}

const send = (port: ReturnType<typeof resend>["port"]) =>
  port.send(
    "sign-in-code",
    "anna@example.com",
    { code: "123456", link: "https://tonaris.app/sign-in/verify#code=123456" },
    { idempotencyKey: "01a18700-0000-7000-8000-000000000001" },
  );

async function failure(promise: Promise<unknown>): Promise<EmailDeliveryError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof EmailDeliveryError))
    throw new Error(`Expected an EmailDeliveryError, got ${String(error)}`);
  return error;
}

describe("resendEmail", () => {
  test("posts the rendered email from the sender, with the key and the idempotency key", async () => {
    const { port, calls } = resend({ status: 200, body: { id: "49a3999c" } });
    await send(port);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(resendEndpoint);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test_key",
      "content-type": "application/json",
      "idempotency-key": "01a18700-0000-7000-8000-000000000001",
    });
    expect(JSON.parse(typeof init.body === "string" ? init.body : "")).toEqual({
      from: "Tonaris <no-reply@mail.tonaris.app>",
      to: ["anna@example.com"],
      subject: "Your Tonaris sign-in code",
      text: expect.stringContaining("123456"),
    });
  });

  test("outages, rate limits and a concurrent retry are worth retrying", async () => {
    for (const [status, name] of [
      [500, "application_error"],
      [503, "service_unavailable"],
      [429, "rate_limit_exceeded"],
      [409, "concurrent_idempotent_requests"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await failure(send(resend({ status, body: { name, message: "x" } }).port));
      expect({ status, retryable: error.retryable, uncertain: error.uncertain }).toEqual({
        status,
        retryable: true,
        uncertain: false,
      });
    }
  });

  test("a refused address, an unverified sender, a bad key or a used-up quota are not", async () => {
    for (const [status, name] of [
      [422, "missing_required_field"],
      [403, "validation_error"],
      [401, "validation_error"],
      [429, "daily_quota_exceeded"],
      [429, "monthly_quota_exceeded"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await failure(
        send(resend({ status, body: { name, message: "The domain is not verified." } }).port),
      );
      expect({ status, name, retryable: error.retryable }).toEqual({
        status,
        name,
        retryable: false,
      });
      expect(error.message).toBe(
        `Resend refused the email: ${status} ${name}, The domain is not verified.`,
      );
    }
  });

  test("a timeout may have sent it; a connection that failed didn't", async () => {
    const timedOut = await failure(
      send(
        resend({ error: new SafeFetchError("timeout", "api.resend.com took more than 10 s") }).port,
      ),
    );
    expect(timedOut).toMatchObject({ retryable: true, uncertain: true });
    const unreachable = await failure(
      send(resend({ error: new SafeFetchError("network", "api.resend.com didn't answer") }).port),
    );
    expect(unreachable).toMatchObject({ retryable: true, uncertain: false });
  });

  test("never puts the API key in an error", async () => {
    const error = await failure(
      send(resend({ status: 401, body: { name: "validation_error" } }).port),
    );
    expect(error.message).not.toContain("re_test_key");
  });
});
