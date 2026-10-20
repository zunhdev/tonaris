// The sync protocol from a real browser (TS-23, TS-102): a signed-in page on the web origin streams the account's
// changes from the API's origin and writes a mutation, with the session cookie. The stream names its cursor in
// the query, so it stays a simple request: a Last-Event-ID header would need a preflight that the API's CORS
// rules refuse, and Chromium then fails the fetch. The sync client itself is tested in Bun (src/client/sync);
// this checks what Bun can't: the browser's CORS, cookies and streaming fetch.

import { expect, test } from "@playwright/test";

import { apiUrl } from "./support/accounts";

test("a signed-in page streams changes and writes a mutation across origins", async ({ page }) => {
  await page.goto("/c");

  const result = await page.evaluate(async (api) => {
    /** A UUIDv7, as packages/domain makes it. It must live in here: the function runs in the page. */
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const uuidv7 = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      let time = Date.now();
      for (let index = 5; index >= 0; index -= 1) {
        bytes[index] = time % 256;
        time = Math.floor(time / 256);
      }
      bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
      bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };

    const stream = await fetch(`${api}/v1/sync/stream?after=0`, { credentials: "include" });
    const reader = stream.body?.getReader();
    if (!reader) return { error: `stream answered ${stream.status}` };
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    const opened = text.startsWith(": open");

    const id = uuidv7();
    const answer = await fetch(`${api}/v1/mutations`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mutationId: uuidv7(),
        name: "album.create",
        args: {
          id,
          title: "Kind of Blue",
          artistCredit: "Miles Davis",
          releaseType: "album",
          isLive: false,
          originalYear: 1959,
          recordingYearStart: null,
          recordingYearEnd: null,
        },
      }),
    });
    const outcome: unknown = await answer.json();

    const deadline = Date.now() + 5_000;
    while (!text.includes(id) && Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    await reader.cancel();
    return { opened, status: answer.status, outcome, received: text.includes(`"id":"${id}"`) };
  }, apiUrl);

  expect(result).toMatchObject({
    opened: true,
    status: 200,
    outcome: { outcome: { status: "confirmed" } },
    received: true,
  });
});
