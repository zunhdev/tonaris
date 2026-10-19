# Tonaris — Elysia 2 viability: Eden v2, OpenAPI and SSE on Bun, 20 October 2026

Spike for [TON-19](https://linear.app/zunhdev/issue/TON-19). It checks the pinned Elysia 2 against the exit criteria in [TS-04](../tech-spec.md):

- Eden v2 types the web client from `type App` (TS-29);
- OpenAPI 3.1 is generated from our Zod schemas (TS-09);
- SSE streaming on the Bun adapter is reliable (TS-23);
- no more than two breaking bumps have each cost over half a day.

Elysia 2 reached its first release candidate on 19 October 2026, the day the spike started. `elysia`, `@elysia/eden`, `@elysia/openapi` and `@elysia/cors` all published `2.0.0-rc.0`. So the spike moved the repository from `2.0.0-beta.32` to the RC and judged the RC.

## Verdict

**Go. Keep Elysia 2, pinned at `2.0.0-rc.0`. All four exit criteria hold, and no fallback to Elysia 1.4 is needed.**

| TS-04 exit criterion | Result on `2.0.0-rc.0` |
| --- | --- |
| Eden v2 types the web client from `type App` | **Holds.** Data, error statuses (as `Problem`) and SSE streams are typed. One workaround from TON-6 is no longer needed. |
| OpenAPI 3.1 from our Zod schemas | **Holds.** The committed `openapi/v1.json` is unchanged on the RC. An SSE route documents `text/event-stream` through `detail.responses`, pointing at a component schema. |
| SSE on the Bun adapter is reliable | **Holds, with three rules**: switch Bun's idle timeout off per stream, send keepalives, and end streams before a graceful stop. 1,000 streams ran for 67 s with no drop and every event delivered, p95 18 ms. |
| No more than two costly breaking bumps | **Holds.** The bump from beta.32 to rc.0 took 5 minutes and needed no code change. |

What stays open isn't Elysia's:

- **The host's proxy.** Whether streams pass through it unbuffered over HTTP/2 needs a deployed host (TS-23). The host is the creator's choice.
- **The real sync stream.** Its hub, history and client are TON-20.

## The bump to the RC

- **`2.0.0-beta.32` → `2.0.0-rc.0`, with the three plugins.** It took 5 minutes from editing `package.json` to a passing suite:
  - both typechecks;
  - all 74 API and web tests;
  - the OpenAPI check;
  - the production builds.
- **The RC is a large change underneath.** Since beta.32 there are 4 commits:
  - one rewrote much of the Bun adapter, the handler compiler and error handling ("cut stuffs", about 2,800 lines added and 1,100 removed);
  - one reworked the lifecycle types (about 9,700 lines added).

  None of it reached our code.
- **TS-04's upgrade policy says at most one bump every two weeks.** The repository took beta.32 in TON-6 on 18 October, so this bump comes early. The creator asked for the RC.
- **One workaround is gone.** In beta.32, a catch-all `onError` handler with a typed return erased every route's types for Eden, so `problem.ts` typed its mapper `any` (TON-6). On the RC, typing it `Response` leaves Eden's types identical, so the `any` is removed.
- **One gotcha remains.** A route with input schemas is still typed as answering 422 with Elysia's own `ValidationProblem`, unless it declares `422: problemSchema`. TS-09's convention covers it.

## Eden v2

- **The web client** (`apps/web/src/api.ts`) types `data` and `error` from the routes.
  - A new test checks that a 401 from `/v1/me` is typed as the `Problem` schema, `code` included. A wrong type there fails `tsc`.
- **Streams are typed too.** For a generator route, Eden's `data` is an `AsyncGenerator` of the events the handler yields.
  - `item.event === "change"` narrows `item.data` to the change's type.
  - Eden skips comment lines, so keepalives never appear as events.
- **Two catches for streams:**
  - **A Zod `response` schema on an SSE route breaks its types**: the generator handler no longer typechecks. Elysia doesn't validate yielded events against it anyway. Stream routes leave `response` out and type their events in code.
  - **Eden parses an `id` that looks like a number into a number**, though the type says `string`. Cursor ids (`seq`, TS-23) are numbers, so a client should convert with `Number(item.id)`, whatever the type says.
- **The web app won't use Eden for the stream.** TS-23's client uses EventSource, which resumes with `Last-Event-ID` by itself. Eden's typed stream suits tests and scripts.

## OpenAPI 3.1

- **Unchanged.** `bun run openapi:check` passes on the RC with the document committed in TON-6: OpenAPI 3.1.2, generated from Zod through Standard Schema.
- **SSE routes need a declaration.** A generator route without a `response` schema gets no response in the document. With one, it is documented as `application/json`, which is wrong.
  - The fix is `detail.responses` with `text/event-stream`, and our `openApiDocument` adds the `default` problem as usual.
  - The schema has to be a `$ref`: Zod's JSON Schema type doesn't fit `openapi-types`' schema objects, and the type error spreads to the route, erasing its Eden types.
  - TON-20 should register the event schema as a component in `openApiDocument`, the way `Problem` is, and reference it.
  - OpenAPI 3.1 can't describe the event framing (`id`, `event`, `data`) itself. Its 3.2 successor adds `itemSchema` for streamed media types.

## SSE on the Bun adapter

Elysia streams `text/event-stream` from a generator handler. Each `sse({ id, event, data })` it yields becomes one event, and when the client goes, Elysia ends the generator. Three behaviors of Bun's needed handling.

1. **Bun cuts quiet connections.** `Bun.serve` closes a connection after `idleTimeout` seconds without traffic; the default is 10.
   - A stream with TS-23's 20 s keepalive was cut after about 12 s (`ECONNRESET`), with Bun warning "timed out a request after 10 seconds".
   - Bun checks on a coarse tick: idle timeouts of 1, 2 and 4 s all cut at 4.0 s.
   - **The fix:** `server.timeout(request, 0)` switches the timeout off for that one request. The stream then outlived it, and every other request keeps the 10 s protection against idle clients.
   - The keepalive is still needed. It keeps proxies from closing the connection, and its writes are how a dead client is noticed.
2. **A response doesn't start until the first event.** Elysia sends the headers with the first value the generator yields. A stream with nothing to say would leave the client waiting for its 200, so the stream sends a comment line at once.
3. **A graceful stop waits for open responses.** `app.stop()` doesn't return while a stream is open, so a deploy would hang until the platform kills the process. `app.stop(true)` resets the streams without waiting for their `finally` blocks.
   - **The fix:** a shutdown signal ends every stream first. Then the graceful stop completes at once (1 ms in the soak), and EventSource clients reconnect to the new instance.

`apps/api/src/sse.ts` packages these three for TON-20:

- **`eventStream(channel, { request, server, keepaliveMs, signal })`:**
  - switches the idle timeout off;
  - sends `: open`, then each event, and `: keepalive` after `keepaliveMs` (20 s by default) without one;
  - ends when the client goes or `signal` aborts.
- **`eventChannel(onEnd)`:** the push source the hub writes to. It ends a waiting reader at once.
  - An async generator can't be the source: its `return()` waits for its pending `next()`, which may wait forever. Its subscription would never be released.

`apps/api/src/sse.test.ts` checks these on a listening server with a 1 s idle timeout:

- the framing;
- a stream outliving the timeout while a quiet stream is cut;
- keepalives only while idle;
- resuming after `Last-Event-ID`;
- leaving the channel when the client goes;
- ending on shutdown with a graceful stop;
- Eden's types;
- the OpenAPI document.

### Soak

[`sse-soak.ts`](../../apps/api/src/sse-soak.ts) runs many streams with production settings: Bun's default 10 s idle timeout and a 20 s keepalive. The clients run in a second process.

| Measure | 1,000 streams |
| --- | --- |
| Connected | 1,000, spread over 2 s |
| Open after 45 s of keepalives only (Bun's idle cut would come at about 12 s) | 1,000 |
| Open after 20 s of 20 broadcasts a second | 1,000 |
| Events delivered | 387 to every stream, 387,000 in all; none lost |
| Delivery latency, broadcast to client | p50 10 ms, p95 18 ms, p99 22 ms, max 32 ms |
| Server memory (RSS) | 16 MB at start, 25 MB connected, 47 MB after the burst |
| Channels left after the clients went | 0 |
| Graceful stop after the shutdown signal | 1 ms |

Run on the creator's Mac (Bun 1.4.3), so the numbers are a floor for one process, not a host measurement. Two limits showed up along the way:

- **Bun's `fetch` allows 256 requests at once** (`BUN_CONFIG_MAX_HTTP_REQUESTS`). The soak raises it for its client process. Browsers and the server are unaffected.
- **Connecting all 1,000 at once lost 14** to `ECONNRESET`, because macOS's listen backlog is 128 (`kern.ipc.somaxconn`). Linux hosts usually allow 4,096.
  - The pattern is real, though: after a deploy drops every stream, every client reconnects within EventSource's retry delay.
  - TON-20 should spread reconnects: a per-connection `retry:` with jitter, or jitter in the client.

### Not covered here

- **EventSource in a browser.** Bun has no EventSource, so the tests read streams with `fetch` and send `Last-Event-ID` themselves. TON-20's client will be tested in Playwright.
- **The host's proxy over HTTP/2.** TS-23 asks whether streams pass through unbuffered and resume after a deploy drop. That needs the creator's host.
- **Slow clients.** Not measured. Elysia's streams pull from the generator as the client reads (pull-based backpressure, since 1.4.28), so a client that stops reading would let its channel's queue grow. TON-20's hub should cap the queue and send `reset` to such clients (TS-23).

## Falling back to 1.4

Not needed. For the record, TS-04 estimated a contained rewrite of about 30 route files. Today the API has a handful of routes, so a fallback would cost under a day. The cost grows with every M2 route, which makes the RC's stability worth tracking until 2.0 is final.

## What this changes elsewhere

- **TS-01's stack table and TS-04:** Elysia 2 is pinned at `2.0.0-rc.0`; the exit criteria are checked; the upgrade policy speaks of the exact pre-release.
- **TS-23:** the keepalive bullet names the per-request timeout, and new bullets cover ending streams on shutdown and documenting a stream in OpenAPI. Its spike bullet keeps only the host's proxy open.
- **`apps/api/src/problem.ts`:** the error mapper is typed `Response`, not `any`.

## Running it again

```sh
bun test apps/api/src/sse.test.ts                  # about 5 s
bun apps/api/src/sse-soak.ts --clients 1000        # about 70 s; --spread, --quiet, --burst, --rate
```
