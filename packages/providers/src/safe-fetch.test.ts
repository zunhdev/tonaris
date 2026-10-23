// The SSRF fixtures (TS-103, TS-106): IP literals, hosts that resolve to private ranges, DNS rebinding and
// redirects to private ranges, with a scripted resolver and connection. Then the pinned connection itself, against
// a local TLS server.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { $ } from "bun";

import {
  connectPinned,
  createSafeFetch,
  SafeFetchError,
  userAgent,
  type Connect,
  type ResolvedAddress,
  type SafeFetchReason,
} from "./safe-fetch";

const publicV4 = "93.184.215.14";
const publicV6 = "2606:2800:21f:cb07:6820:80da:af6b:8b2c";

type Sent = { url: string; address: string; headers: Headers; method: string; body: unknown };

/**
 * A safeFetch whose DNS answers from `dns` (a host's addresses, or a function called on each lookup), and whose
 * connections answer from `answer`. It records every lookup and every request sent.
 */
function scripted(
  dns: Record<string, string[] | (() => string[])>,
  answer: (url: URL, address: ResolvedAddress) => Response | Promise<Response> = () =>
    new Response("ok"),
) {
  const lookups: string[] = [];
  const sent: Sent[] = [];
  const connect: Connect = async (url, address, init) => {
    sent.push({
      url: url.href,
      address: address.address,
      headers: new Headers(init.headers),
      method: init.method ?? "GET",
      body: init.body,
    });
    return answer(url, address);
  };
  const safeFetch = createSafeFetch({
    resolve: async (hostname) => {
      lookups.push(hostname);
      const entry = dns[hostname];
      const addresses = typeof entry === "function" ? entry() : (entry ?? []);
      return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    },
    connect,
  });
  return { safeFetch, lookups, sent };
}

async function refusal(request: Promise<unknown>): Promise<SafeFetchReason> {
  try {
    await request;
  } catch (error) {
    if (error instanceof SafeFetchError) return error.reason;
    throw error;
  }
  throw new Error("the request wasn't refused");
}

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

/** Each URL's refusal, side by side with the URL, so a failure names it. */
const refusals = (urls: string[], fetchOne: (url: string) => Promise<Response>) =>
  Promise.all(urls.map(async (url) => [url, await refusal(fetchOne(url))]));

/** A safeFetch for a host that redirects `count` times before answering. */
function redirecting(count: number) {
  let served = 0;
  return scripted({ "public.example.com": [publicV4] }, () =>
    served++ < count ? redirect(`/hop/${served}`) : new Response("arrived"),
  );
}

/** What a promise rejected with. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("it didn't reject");
}

describe("safeFetch: what it refuses before any lookup (TS-103)", () => {
  test("IP literals, however they are written", async () => {
    const { safeFetch, lookups, sent } = scripted({});
    const urls = [
      "https://127.0.0.1/",
      "https://127.1/",
      "https://2130706433/",
      "https://0x7f000001/",
      "https://0177.0.0.1/",
      "https://0x7f.0.0.1/",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:7f00:1]/",
      "https://169.254.169.254/latest/meta-data/",
      "https://[fd00:ec2::254]/latest/meta-data/",
      "https://[fe80::1%25en0]/",
      "https://8.8.8.8/",
      "https://①②⑦.0.0.1/",
    ];
    expect(await refusals(urls, safeFetch)).toEqual(urls.map((url) => [url, "url"]));
    expect(lookups).toEqual([]);
    expect(sent).toEqual([]);
  });

  test("anything but https on its default port, credentials, and local names", async () => {
    const { safeFetch, lookups, sent } = scripted({});
    const urls = [
      "http://example.com/",
      "ftp://example.com/",
      "file:///etc/passwd",
      "https://example.com:8443/",
      "https://example.com:80/",
      "https://user:secret@example.com/",
      "https://localhost/",
      "https://metadata/computeMetadata/v1/",
      "https://example.com./",
      "not a URL",
    ];
    expect(await refusals(urls, safeFetch)).toEqual(urls.map((url) => [url, "url"]));
    expect(lookups).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe("safeFetch: DNS (TS-103)", () => {
  test("hosts that resolve to private, loopback, link-local or metadata addresses are never requested", async () => {
    const { safeFetch, sent } = scripted({
      "internal.example.com": ["10.0.0.5"],
      "metadata.example.com": ["169.254.169.254"],
      "loopback.example.com": ["::1"],
      "mapped.example.com": ["::ffff:10.0.0.1"],
      "cgnat.example.com": ["100.100.100.200"],
      // One private address among public ones is enough to refuse.
      "mixed.example.com": [publicV4, "127.0.0.1"],
    });
    const urls = ["internal", "metadata", "loopback", "mapped", "cgnat", "mixed"].map(
      (host) => `https://${host}.example.com/`,
    );
    expect(await refusals(urls, safeFetch)).toEqual(urls.map((url) => [url, "address"]));
    expect(sent).toEqual([]);
  });

  test("DNS rebinding: the request goes to the address that was checked, not a second answer", async () => {
    let answers = 0;
    const { safeFetch, lookups, sent } = scripted({
      "rebind.example.com": () => (answers++ === 0 ? [publicV4] : ["127.0.0.1"]),
    });
    const response = await safeFetch("https://rebind.example.com/path?q=1");
    expect(await response.text()).toBe("ok");
    expect(lookups).toEqual(["rebind.example.com"]);
    expect(sent.map(({ url, address }) => ({ url, address }))).toEqual([
      { url: "https://rebind.example.com/path?q=1", address: publicV4 },
    ]);
  });

  test("a host that doesn't resolve", async () => {
    const { safeFetch } = scripted({});
    expect(await refusal(safeFetch("https://nowhere.example.com/"))).toBe("dns");
  });

  test("IPv4 first, and the next address when a connection fails", async () => {
    const { safeFetch, sent } = scripted(
      { "both.example.com": [publicV6, publicV4] },
      (_url, { family }) => {
        if (family === 4) throw new TypeError("ConnectionRefused");
        return new Response("over IPv6");
      },
    );
    expect(await (await safeFetch("https://both.example.com/")).text()).toBe("over IPv6");
    expect(sent.map(({ address }) => address)).toEqual([publicV4, publicV6]);
  });

  test("a POST goes to one address only", async () => {
    const { safeFetch, sent } = scripted({ "both.example.com": [publicV4, publicV6] }, () => {
      throw new TypeError("ConnectionRefused");
    });
    expect(
      await refusal(safeFetch("https://both.example.com/", { method: "POST", body: "x" })),
    ).toBe("network");
    expect(sent).toHaveLength(1);
  });
});

describe("safeFetch: redirects (TS-103)", () => {
  test("each hop is checked like the first request", async () => {
    const locations = [
      "https://internal.example.com/", // resolves to a private address
      "http://169.254.169.254/latest/meta-data/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "http://public.example.com/",
      "https://localhost/",
    ];
    const outcomes = await Promise.all(
      locations.map(async (location) => {
        const { safeFetch, sent } = scripted(
          { "public.example.com": [publicV4], "internal.example.com": ["192.168.1.1"] },
          () => redirect(location),
        );
        return [location, await refusal(safeFetch("https://public.example.com/")), sent.length];
      }),
    );
    expect(outcomes).toEqual(
      locations.map((location) => [
        location,
        location.startsWith("https://internal") ? "address" : "url",
        1,
      ]),
    );
  });

  test("at most 3 redirects", async () => {
    const three = redirecting(3);
    const response = await three.safeFetch("https://public.example.com/start");
    expect(await response.text()).toBe("arrived");
    expect(response.url).toBe("https://public.example.com/hop/3");
    expect(three.sent).toHaveLength(4);

    const four = redirecting(4);
    expect(await refusal(four.safeFetch("https://public.example.com/start"))).toBe("redirects");
    expect(four.sent).toHaveLength(4);
  });

  test("manual redirects come back as they are, for callers that read Location themselves", async () => {
    const { safeFetch, sent } = scripted({ "spotify.link": [publicV4] }, () =>
      redirect("https://open.spotify.com/", 307),
    );
    const response = await safeFetch("https://spotify.link/abc123XYZ", { redirect: "manual" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://open.spotify.com/");
    expect(sent).toHaveLength(1);
  });

  test("credentials stay with their origin", async () => {
    const { safeFetch, sent } = scripted(
      { "api.example.com": [publicV4], "cdn.example.net": [publicV4] },
      (url) =>
        url.pathname === "/a"
          ? redirect("/b")
          : url.pathname === "/b"
            ? redirect("https://cdn.example.net/c")
            : new Response("done"),
    );
    await safeFetch("https://api.example.com/a", {
      headers: { authorization: "Bearer token", cookie: "a=b", accept: "application/json" },
    });
    expect(sent.map(({ headers }) => headers.get("authorization"))).toEqual([
      "Bearer token",
      "Bearer token",
      null,
    ]);
    expect(sent[2]?.headers.get("cookie")).toBeNull();
    expect(sent[2]?.headers.get("accept")).toBe("application/json");
  });

  test("a 303 turns a POST into a GET without its body", async () => {
    const { safeFetch, sent } = scripted({ "accounts.example.com": [publicV4] }, (url) =>
      url.pathname === "/token" ? redirect("/done", 303) : new Response("ok"),
    );
    await safeFetch("https://accounts.example.com/token", {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(sent.map(({ method, body }) => [method, body])).toEqual([
      ["POST", "grant_type=client_credentials"],
      ["GET", undefined],
    ]);
    expect(sent[1]?.headers.get("content-type")).toBeNull();
  });
});

describe("safeFetch: limits (TS-103)", () => {
  test("5 s by default, for the whole exchange", async () => {
    const { safeFetch } = scripted(
      { "slow.example.com": [publicV4] },
      (_url) => new Promise<Response>(() => {}),
    );
    const started = performance.now();
    expect(await refusal(safeFetch("https://slow.example.com/", { timeoutMs: 50 }))).toBe(
      "timeout",
    );
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  test("a body that stalls is cut off at the deadline", async () => {
    const { safeFetch } = scripted({ "slow.example.com": [publicV4] }, () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("start"));
        },
      });
      return new Response(stream);
    });
    const response = await safeFetch("https://slow.example.com/", { timeoutMs: 50 });
    expect(await refusal(response.text())).toBe("timeout");
  });

  test("the caller's own signal still aborts with its reason", async () => {
    const { safeFetch } = scripted(
      { "slow.example.com": [publicV4] },
      () => new Promise<Response>(() => {}),
    );
    const controller = new AbortController();
    const request = safeFetch("https://slow.example.com/", { signal: controller.signal });
    controller.abort(new Error("the job was cancelled"));
    expect(await rejection(request)).toEqual(new Error("the job was cancelled"));
  });

  test("bodies of more than 5 MB, declared or streamed", async () => {
    const big = new Uint8Array(1_024 + 1);
    const declared = scripted(
      { "big.example.com": [publicV4] },
      () => new Response(null, { headers: { "content-length": String(5 * 1024 * 1024 + 1) } }),
    );
    expect(await refusal(declared.safeFetch("https://big.example.com/"))).toBe("size");

    const streamed = scripted({ "big.example.com": [publicV4] }, () => new Response(big));
    const response = await streamed.safeFetch("https://big.example.com/", { maxBytes: 1_024 });
    expect(await refusal(response.arrayBuffer())).toBe("size");

    const exact = scripted({ "big.example.com": [publicV4] }, () => new Response(big.slice(1)));
    const fits = await exact.safeFetch("https://big.example.com/", { maxBytes: 1_024 });
    expect((await fits.arrayBuffer()).byteLength).toBe(1_024);
  });

  test("only the media types asked for, when the answer succeeds", async () => {
    const { safeFetch } = scripted({ "img.example.com": [publicV4] }, (url) =>
      url.pathname === "/missing"
        ? new Response("not found", { status: 404, headers: { "content-type": "text/plain" } })
        : url.pathname === "/page"
          ? new Response("<html>", { headers: { "content-type": "text/html" } })
          : new Response("JFIF", { headers: { "content-type": "image/jpeg" } }),
    );
    const images = { contentTypes: ["image/"] };
    expect(await refusal(safeFetch("https://img.example.com/page", images))).toBe("content_type");
    expect((await safeFetch("https://img.example.com/cover.jpg", images)).status).toBe(200);
    expect((await safeFetch("https://img.example.com/missing", images)).status).toBe(404);
  });
});

describe("safeFetch: requests", () => {
  test("an honest User-Agent unless the caller sends its own", async () => {
    const { safeFetch, sent } = scripted({ "musicbrainz.org": [publicV4] });
    await safeFetch("https://musicbrainz.org/ws/2/url");
    await safeFetch("https://musicbrainz.org/ws/2/url", { headers: { "user-agent": "Other/1" } });
    expect(sent.map(({ headers }) => headers.get("user-agent"))).toEqual([userAgent, "Other/1"]);
    expect(userAgent).toStartWith("Tonaris/");
  });

  test("errors name the URL without its query", async () => {
    const { safeFetch } = scripted({ "musicbrainz.org": ["10.0.0.1"] });
    const error = await safeFetch(
      "https://musicbrainz.org/ws/2/release?query=barcode:0602445790081",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SafeFetchError);
    expect(String(error)).not.toContain("0602445790081");
    const timeout = scripted(
      { "musicbrainz.org": [publicV4] },
      () => new Promise<Response>(() => {}),
    );
    const late = await timeout
      .safeFetch("https://musicbrainz.org/ws/2/release?query=barcode:0602445790081", {
        timeoutMs: 20,
      })
      .catch((caught: unknown) => caught);
    expect(String(late)).toContain("https://musicbrainz.org/ws/2/release");
    expect(String(late)).not.toContain("0602445790081");
  });
});

describe("connectPinned: the connection itself", () => {
  // A certificate for pinned.test only, made for this run.
  let dir = "";
  let cert = "";
  let server: ReturnType<typeof Bun.serve> | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tonaris-pinned-"));
    await $`openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout ${dir}/key.pem -out ${dir}/cert.pem -days 1 -subj /CN=pinned.test -addext subjectAltName=DNS:pinned.test`.quiet();
    cert = await Bun.file(`${dir}/cert.pem`).text();
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      tls: { cert, key: await Bun.file(`${dir}/key.pem`).text() },
      fetch: (request) =>
        Response.json({ host: request.headers.get("host"), path: new URL(request.url).pathname }),
    });
  });

  afterAll(async () => {
    await server?.stop(true);
    await rm(dir, { recursive: true, force: true });
  });

  test("connects to the address given, as the host: Host and the certificate are the host's", async () => {
    const connect = connectPinned({ ca: cert });
    const url = new URL(`https://pinned.test:${server?.port}/ws?q=1`);
    // pinned.test doesn't resolve: only the address given can have answered.
    const response = await connect(url, { address: "127.0.0.1", family: 4 }, {});
    expect(await response.json()).toEqual({ host: `pinned.test:${server?.port}`, path: "/ws" });
  });

  test("a certificate for another name is refused", async () => {
    const connect = connectPinned({ ca: cert });
    const url = new URL(`https://elsewhere.test:${server?.port}/`);
    const error = await rejection(connect(url, { address: "127.0.0.1", family: 4 }, {}));
    expect(String(error)).toContain("is not in the cert's altnames");
  });
});
