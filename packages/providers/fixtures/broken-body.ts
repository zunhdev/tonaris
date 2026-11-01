// An answer whose body starts and then breaks off, as one does when `safeFetch`'s deadline passes mid-body (TS-103):
// the status and headers arrive, and reading the body rejects.

import { SafeFetchError } from "../src/safe-fetch";

export function brokenBody(init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  let sent = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.error(
            new SafeFetchError("timeout", "https://example.com/ took more than 5 s"),
          );
          return;
        }
        sent = true;
        controller.enqueue(encoder.encode('{"items": [{"partial": '));
      },
    }),
    init,
  );
}
