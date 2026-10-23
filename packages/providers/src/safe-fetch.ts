// One fetch for every outbound call (TS-103, Q-05): short links, MusicBrainz, the Cover Art Archive, iTunes
// Lookup, Spotify, the Qobuz and Tidal store pages, and the image proxy. URLs reach it from pasted links,
// provider metadata and owners' artwork, so it refuses anything but public https hosts:
// - https on the default port only, with no credentials and no IP address for a host;
// - DNS checked on every hop, every address public (`isPublicAddress`), and the connection made to the address
//   that was checked, with the host's name for TLS and Host, so DNS can't answer differently in between;
// - at most 3 redirects, each checked like the first request, or none when the caller reads `Location` itself;
// - 5 s for the whole exchange, body included, and 5 MB at most.
// Server-only: it needs DNS and TLS options browsers don't have.

import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";
import { checkServerIdentity, type PeerCertificate } from "node:tls";

import { isPublicAddress } from "./addresses";

/** Who is asking, honestly: MusicBrainz asks for a contact, and TS-41's store pages for an honest agent. */
export const userAgent = "Tonaris/0.1 ( https://github.com/zunhdev/tonaris )";
export const safeFetchTimeoutMs = 5_000;
export const safeFetchMaxBytes = 5 * 1024 * 1024;
export const safeFetchMaxRedirects = 3;

/** Why a request was refused or failed. */
export type SafeFetchReason =
  | "url" // not https on the default port, credentials, an IP address, or not a public host name
  | "address" // the host resolves to an address that isn't public
  | "dns" // the host doesn't resolve
  | "redirects" // too many, or one that can't be followed
  | "timeout"
  | "size"
  | "content_type"
  | "network";

/**
 * A refused or failed request. Messages name the URL without its query, which can carry values that mustn't be
 * logged, such as a Spotify-derived barcode in a MusicBrainz search (TS-41).
 */
export class SafeFetchError extends Error {
  override name = "SafeFetchError";
  constructor(
    readonly reason: SafeFetchReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export type SafeFetchInit = RequestInit & {
  timeoutMs?: number;
  maxBytes?: number;
  /** Media types a successful response must have, as prefixes: `["image/"]` for the image proxy. */
  contentTypes?: readonly string[];
};

export type ResolvedAddress = { address: string; family: number };

/** Every address a host name resolves to. */
export type Resolve = (hostname: string) => Promise<ResolvedAddress[]>;

/** One request to `address`, sent as a request to `url`: TLS and Host use `url`'s host name. */
export type Connect = (url: URL, address: ResolvedAddress, init: RequestInit) => Promise<Response>;

const resolveWithDns: Resolve = (hostname) => lookup(hostname, { all: true, verbatim: true });

/**
 * Sends a request to an address that was checked, as a request to `url`: the certificate must name `url`'s host,
 * and that name goes in SNI and Host. Proxies from the environment are ignored, as they would resolve the host
 * themselves. `ca` is for tests.
 */
export function connectPinned({ ca }: { ca?: string } = {}): Connect {
  return (url, { address, family }, init) => {
    const host = family === 6 ? `[${address}]` : address;
    const headers = new Headers(init.headers);
    headers.set("host", url.host);
    return fetch(`https://${host}${url.port ? `:${url.port}` : ""}${url.pathname}${url.search}`, {
      ...init,
      headers,
      redirect: "manual",
      proxy: false,
      tls: {
        ...(ca ? { ca } : {}),
        serverName: url.hostname,
        checkServerIdentity: (_name: string, certificate: PeerCertificate) =>
          checkServerIdentity(url.hostname, certificate),
      },
    });
  };
}

/** The URL without its query or fragment, for messages. */
const shown = (url: URL) => `${url.origin}${url.pathname}`;

function checkedUrl(input: string | URL, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    throw new SafeFetchError(
      "url",
      base ? `${shown(base)} redirected to an invalid URL` : "Not a URL",
    );
  }
  if (url.protocol !== "https:" || url.port !== "") {
    throw new SafeFetchError("url", `${url.protocol}//${url.host} isn't https on its default port`);
  }
  if (url.username || url.password) {
    throw new SafeFetchError("url", `${shown(url)} carries credentials`);
  }
  // The URL parser has already turned 127.1, 2130706433 and 0x7f.0.0.1 into dotted quads.
  const host = url.hostname;
  if (host.startsWith("[") || isIPv4(host)) {
    throw new SafeFetchError("url", `${shown(url)} names an IP address, not a host`);
  }
  // Single labels (localhost, metadata) are local names; a trailing dot would slip past TLS's name check.
  if (!host.includes(".") || host.endsWith(".")) {
    throw new SafeFetchError("url", `${shown(url)} isn't a public host name`);
  }
  url.hash = "";
  return url;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const nullBodyStatuses = new Set([101, 103, 204, 205, 304]);
const replayable = (body: RequestInit["body"]) =>
  body == null || typeof body === "string" || body instanceof URLSearchParams;

/** Settles with `promise`, or rejects when `signal` aborts first. */
async function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const { promise: aborted, reject } = Promise.withResolvers<never>();
  const abort = () => reject(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** Lets go of a body nobody will read. */
function discard(response: Response): void {
  void response.body?.cancel().catch(() => {});
}

/** Builds a `safeFetch`. The defaults are DNS and the pinned connection; tests pass their own. */
export function createSafeFetch({
  resolve = resolveWithDns,
  connect = connectPinned(),
}: { resolve?: Resolve; connect?: Connect } = {}) {
  return async function safeFetch(
    input: string | URL,
    init: SafeFetchInit = {},
  ): Promise<Response> {
    const {
      timeoutMs = safeFetchTimeoutMs,
      maxBytes = safeFetchMaxBytes,
      contentTypes,
      redirect = "follow",
      signal: callerSignal,
      method: requestedMethod = "GET",
      body: requestBody,
      headers: requestHeaders,
    } = init;
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
    /** What an abort means: the caller's own reason, or the deadline. */
    const aborted = (url: URL, cause?: unknown) =>
      callerSignal?.aborted
        ? callerSignal.reason
        : new SafeFetchError("timeout", `${shown(url)} took more than ${timeoutMs / 1000} s`, {
            cause,
          });

    let url = checkedUrl(input);
    let method = requestedMethod.toUpperCase();
    let body = requestBody;
    const headers = new Headers(requestHeaders);
    if (!headers.has("user-agent")) headers.set("user-agent", userAgent);

    /** One hop: resolve, check every address, and try them in turn, IPv4 first. */
    const send = async (target: URL): Promise<Response> => {
      let addresses: ResolvedAddress[];
      try {
        addresses = await untilAborted(resolve(target.hostname), signal);
      } catch (error) {
        if (signal.aborted) throw aborted(target, error);
        throw new SafeFetchError("dns", `${target.hostname} doesn't resolve`, { cause: error });
      }
      if (addresses.length === 0)
        throw new SafeFetchError("dns", `${target.hostname} doesn't resolve`);
      if (!addresses.every(({ address }) => isPublicAddress(address))) {
        throw new SafeFetchError(
          "address",
          `${target.hostname} resolves to an address that isn't public`,
        );
      }
      // Hosts without IPv6 routes are common, so IPv4 goes first.
      const ordered = addresses.toSorted((a, b) => a.family - b.family);
      // Only a request that changes nothing may go to a second address after the first failed.
      const tries = method === "GET" || method === "HEAD" ? ordered : ordered.slice(0, 1);
      let failure: unknown;
      for (const address of tries) {
        try {
          // Addresses are tried one after another, never at once. The deadline holds even if a connection
          // ignores its signal.
          // oxlint-disable-next-line no-await-in-loop
          return await untilAborted(
            connect(target, address, { method, headers, body, signal }),
            signal,
          );
        } catch (error) {
          if (signal.aborted) throw aborted(target, error);
          failure = error;
        }
      }
      throw new SafeFetchError("network", `Couldn't reach ${shown(target)}`, { cause: failure });
    };

    for (let redirects = 0; ; redirects++) {
      // Each hop depends on the previous one's Location.
      // oxlint-disable-next-line no-await-in-loop
      const response = await send(url);
      const location = response.headers.get("location");
      if (redirect === "manual" || !redirectStatuses.has(response.status) || location === null) {
        return finish(response, url);
      }
      discard(response);
      if (redirect === "error") throw new SafeFetchError("redirects", `${shown(url)} redirected`);
      if (redirects === safeFetchMaxRedirects) {
        throw new SafeFetchError(
          "redirects",
          `${shown(url)} redirected more than ${safeFetchMaxRedirects} times`,
        );
      }
      const next = checkedUrl(location, url);
      // As browsers do: credentials stay with the origin they were meant for.
      if (next.origin !== url.origin) {
        for (const name of ["authorization", "cookie", "proxy-authorization"]) headers.delete(name);
      }
      if (response.status === 303 || (response.status <= 302 && method === "POST")) {
        method = method === "HEAD" ? "HEAD" : "GET";
        body = undefined;
        headers.delete("content-type");
      } else if (!replayable(body)) {
        throw new SafeFetchError(
          "redirects",
          `${shown(url)} redirected a body that can't be sent again`,
        );
      }
      url = next;
    }

    /** The response as the caller gets it: checked, its body limited, and its `url` the last hop's. */
    function finish(response: Response, at: URL): Response {
      const type = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentTypes && response.ok && !contentTypes.some((prefix) => type.startsWith(prefix))) {
        discard(response);
        throw new SafeFetchError(
          "content_type",
          `${shown(at)} answered ${type || "no content type"}`,
        );
      }
      if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
        discard(response);
        throw new SafeFetchError("size", `${shown(at)} is larger than ${maxBytes} bytes`);
      }
      const answered = new Headers(response.headers);
      // The body arrives decoded, so its encoding and length no longer describe it.
      if (answered.has("content-encoding")) {
        answered.delete("content-encoding");
        answered.delete("content-length");
      }
      const result = new Response(
        response.body && !nullBodyStatuses.has(response.status) ? limited(response.body, at) : null,
        { status: response.status, statusText: response.statusText, headers: answered },
      );
      Object.defineProperty(result, "url", { value: at.href });
      return result;
    }

    /** `source`, failing once it passes `maxBytes`, with the deadline's and the network's errors as ours. */
    function limited(source: ReadableStream<Uint8Array>, at: URL): ReadableStream<Uint8Array> {
      const reader = source.getReader();
      let total = 0;
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          let chunk: Awaited<ReturnType<typeof reader.read>>;
          try {
            chunk = await untilAborted(reader.read(), signal);
          } catch (error) {
            void reader.cancel().catch(() => {});
            controller.error(
              signal.aborted
                ? aborted(at, error)
                : new SafeFetchError("network", `${shown(at)} broke off`, { cause: error }),
            );
            return;
          }
          if (chunk.done) {
            controller.close();
            return;
          }
          total += chunk.value.byteLength;
          if (total > maxBytes) {
            controller.error(
              new SafeFetchError("size", `${shown(at)} is larger than ${maxBytes} bytes`),
            );
            void reader.cancel().catch(() => {});
            return;
          }
          controller.enqueue(chunk.value);
        },
        cancel: (reason) => reader.cancel(reason),
      });
    }
  };
}

/** The fetch for every outbound call (TS-103). */
export const safeFetch = createSafeFetch();
