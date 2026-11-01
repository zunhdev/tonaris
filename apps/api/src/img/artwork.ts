// Artwork through the API (TS-103; FR-03.4, Q-05): clients show an album's artwork only from
// `/img/{signature}/{base64url(url)}` on the API host, never from the artwork's own host. That keeps viewers' and
// guests' addresses from third parties, and fits the web app's strict CSP (`img-src` self and the API).
// - The server signs every artwork URL it sends: album records in the bootstrap and on the stream carry
//   `artworkSignature`, an HMAC of the URL, so only URLs the server itself signed are ever fetched.
// - The key is derived from the auth secret for this one use, so a deploy needs no new secret.
// - The proxy fetches through `safeFetch`: public https hosts only, every hop checked, 5 s, at most 5 MB, and raster
//   images only (SVG, which can carry scripts, isn't served). Answers are cached for a week, and immutable, since a
//   path names one URL for good. A failure answers 404 with no body, and the client keeps the fallback tile (DS-23).

import { createHmac, timingSafeEqual } from "node:crypto";

import { Elysia } from "elysia";

import type { Bootstrap, Change, SharedSnapshot } from "@tonaris/domain";
import { safeFetch, SafeFetchError, type SafeFetchInit } from "@tonaris/providers";

/** What the proxy fetches with: `safeFetch`, or a stand-in in tests. */
export type ImageFetch = (url: string, init: SafeFetchInit) => Promise<Response>;

/** The raster images the proxy serves (TS-103). */
export const artworkTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/** How long browsers and caches keep an image: a path always names the same URL. */
const cacheControl = "public, max-age=604800, immutable";

export type ArtworkSigner = ReturnType<typeof artworkSigner>;

/** Signs and checks artwork URLs with a key derived from `secret` for the image proxy alone. */
export function artworkSigner(secret: string) {
  const key = createHmac("sha256", secret).update("tonaris:image-proxy:v1").digest();
  /** 128 bits of HMAC-SHA256, as base64url: 22 characters. */
  const sign = (url: string) =>
    createHmac("sha256", key).update(url).digest("base64url").slice(0, 22);
  return {
    sign,
    verify: (signature: string, url: string): boolean => {
      const expected = Buffer.from(sign(url));
      const given = Buffer.from(signature);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}

/** A change as the stream sends it: an album's with its artwork signed. */
export function presentChange(signer: ArtworkSigner, change: Change): Change {
  if (change.entity !== "album" || !change.data?.artworkUrl) return change;
  return {
    ...change,
    data: { ...change.data, artworkSignature: signer.sign(change.data.artworkUrl) },
  };
}

/** The bootstrap as clients get it: its albums with their artwork signed. */
export function presentBootstrap(signer: ArtworkSigner, snapshot: Bootstrap): Bootstrap {
  return {
    ...snapshot,
    albums: snapshot.albums.map((album) =>
      album.artworkUrl ? { ...album, artworkSignature: signer.sign(album.artworkUrl) } : album,
    ),
  };
}

/** A shared folder or list as its guests and viewers get it: its albums with their artwork signed. */
export function presentSnapshot(signer: ArtworkSigner, snapshot: SharedSnapshot): SharedSnapshot {
  return {
    ...snapshot,
    albums: snapshot.albums.map((album) =>
      album.artworkUrl ? { ...album, artworkSignature: signer.sign(album.artworkUrl) } : album,
    ),
  };
}

/** The URL a path's last segment encodes, if it is base64url of UTF-8. */
function decoded(encoded: string): string | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return undefined;
  const url = Buffer.from(encoded, "base64url").toString("utf8");
  // A round trip that changes it wasn't base64url of this text.
  return Buffer.from(url, "utf8").toString("base64url") === encoded ? url : undefined;
}

const notFound = () =>
  new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

/**
 * `GET /img/{signature}/{encoded}`: the artwork at the URL `encoded` names, if the server signed it. Outside /v1 and
 * the OpenAPI document: it serves images, not the API's data. `fetch` stands in for `safeFetch` in tests.
 */
export function artworkRoutes(
  signer: ArtworkSigner,
  { fetch = safeFetch }: { fetch?: ImageFetch } = {},
) {
  return new Elysia().get(
    "/img/:signature/:encoded",
    { detail: { hide: true } },
    async ({ params }) => {
      const url = decoded(params.encoded);
      if (url === undefined || !signer.verify(params.signature, url)) return notFound();
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: { accept: artworkTypes.join(", ") },
          contentTypes: artworkTypes,
        });
      } catch (error) {
        if (error instanceof SafeFetchError) return notFound();
        throw error;
      }
      const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
      if (!response.ok || type === undefined || !artworkTypes.includes(type)) {
        await response.body?.cancel().catch(() => {});
        return notFound();
      }
      return new Response(await response.arrayBuffer(), {
        headers: { "content-type": type, "cache-control": cacheControl },
      });
    },
  );
}
