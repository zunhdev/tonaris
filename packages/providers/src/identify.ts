// TS-41's resolver chain, as decided on 21 October 2026: what album a pasted link names. In order, stopping at the
// first confident answer:
//   0. parse the link, following a short link;
//   1. an album of the owner's with the same link, Trash included;
//   2. MusicBrainz's URL lookup, every form of the album's link in one request;
//   3. the barcode bridge: a Spotify UPC, or a 13-digit Qobuz id;
//   4. hints for a strict MusicBrainz match: iTunes Lookup, Qobuz's and Tidal's album pages, or YouTube's Data API;
//   5. manual entry, with the link kept and, for Apple, its hints. An agent's details for it get step 4's rule
//      (`matchDetails`, TON-111).
// A confident answer is one MusicBrainz album, the release group (FR-02.12). Spotify values stay in this module's
// local variables (TS-41); store-page and YouTube hints go to step 4 only; agent captures read no store page
// (FR-10.5), though YouTube's API, like iTunes Lookup, is read for them too.

import { z } from "zod";

import {
  linkEntityId,
  type CapturePrefill,
  serviceNames,
  type Failure,
  type Outcome,
  type StreamingService,
} from "@tonaris/domain";

import { ProviderUnavailableError, unavailableFailure } from "./errors";
import { cleanTitle, matchHints, type HintMatch, type Hints } from "./hints";
import type { AppleAlbum, ItunesLookup } from "./itunes";
import { barcodeForms, qobuzBarcode, urlForms } from "./link-forms";
import { readLink, type Fetcher, type ParsedLink } from "./links";
import type { MusicBrainz } from "./musicbrainz";
import { safeFetch } from "./safe-fetch";
import { appleLookupStorefronts } from "./services";
import type { Spotify } from "./spotify";
import { extractQobuzHints, type StorePages } from "./store-pages";
import type { YouTubeData } from "./youtube";

/** An album offered to choose from: MusicBrainz's release group and a title to show. */
export type AlbumCandidate = { releaseGroupId: string; title: string };

/** Manual entry's prefill: only Apple's hints, which may become album data once confirmed (TS-41). */
export type Prefill = CapturePrefill & { source: "itunes-lookup" };

export type Identification =
  /** Step 1: an album of the owner's already has this link. */
  | { status: "linked"; link: ParsedLink; albumId: string }
  /** Steps 2–4: one MusicBrainz album. */
  | { status: "identified"; link: ParsedLink; step: 2 | 3 | 4; releaseGroupId: string }
  /** Several albums fit: the person chooses (FR-02.9, TS-26). */
  | { status: "ambiguous"; link: ParsedLink; step: 2 | 3 | 4; candidates: AlbumCandidate[] }
  /** Step 5: manual entry, with the link kept. `reason` is for people (DS-48). */
  | { status: "unidentified"; link: ParsedLink; reason: string; prefill?: Prefill }
  /** Unsupported input, or a provider that can't be asked now. */
  | { status: "failed"; failure: Failure };

/** What an agent says an album is, after its link went unidentified: matched only with an original year. */
export type AgentDetails = { title: string; artistCredit: string; originalYear: number };

export type IdentifyContext = {
  /** True when an agent captures through MCP: no store page is read (FR-10.5). */
  agent: boolean;
  /** Step 1: the owner's album with this service's entity id, Trash included. */
  linked: (service: StreamingService, entityId: string) => Promise<string | undefined>;
  /**
   * Whether YouTube's API may be read for this owner: only once they agreed to the current terms, which say Tonaris
   * uses YouTube API Services (TON-131). Asked only when a YouTube Music link reaches step 4.
   */
  mayReadYouTube: () => Promise<boolean>;
};

export type IdentifierDeps = {
  musicBrainz: MusicBrainz;
  itunes: ItunesLookup;
  pages: StorePages;
  /** The Spotify bridge; absent when it is off (TS-41's off switch). */
  spotify?: Spotify | undefined;
  /** YouTube Music's hints; absent without `YOUTUBE_API_KEY`, when step 4 is skipped (TS-105). */
  youtube?: YouTubeData | undefined;
  /** For short links; `safeFetch` unless a test stands in. */
  fetch?: Fetcher;
};

/** Why a link went to manual entry, written for people (DS-48, DS-107). */
export const unidentifiedReasons = {
  notFound: "Tonaris couldn't find this album in MusicBrainz. Enter its details; the link is kept.",
  trackOnly: (service: "qobuz" | "tidal") =>
    `A ${serviceNames[service]} track link doesn't say which album it's on. Enter the album's details; the link is kept.`,
  spotifyOff:
    "Tonaris can't ask Spotify which album this track is on right now. Enter the album's details; the link is kept.",
  gone: (service: StreamingService) =>
    `${serviceNames[service]} doesn't have this anymore. Check the link, or enter the album's details.`,
};

const releaseGroupSchema = z.object({
  "release-group": z.object({ id: z.string(), title: z.string() }).optional(),
});

/** Releases looked up for their album in step 2, at most: a streaming URL names one or a few. */
const maxReleasesPerUrl = 10;

type Found =
  | { kind: "one"; album: AlbumCandidate }
  | { kind: "several"; albums: AlbumCandidate[] }
  | undefined;

function albumsFound(albums: readonly AlbumCandidate[]): Found {
  const unique = [...new Map(albums.map((album) => [album.releaseGroupId, album])).values()];
  const [only] = unique;
  if (unique.length === 1 && only) return { kind: "one", album: only };
  return unique.length > 1 ? { kind: "several", albums: unique } : undefined;
}

/** The answer a step found, or undefined to go on. */
function answer(link: ParsedLink, step: 2 | 3 | 4, found: Found): Identification | undefined {
  if (found?.kind === "one") {
    return { status: "identified", link, step, releaseGroupId: found.album.releaseGroupId };
  }
  if (found?.kind === "several")
    return { status: "ambiguous", link, step, candidates: found.albums };
  return undefined;
}

function unidentified(link: ParsedLink, reason: string, prefill?: Prefill): Identification {
  return { status: "unidentified", link, reason, ...(prefill ? { prefill } : {}) };
}

export function createIdentifier(deps: IdentifierDeps) {
  const { musicBrainz, itunes, pages, spotify, youtube } = deps;

  /** Step 2: every form of the album's link, then the albums of the releases it is linked to. */
  async function byUrls(forms: readonly string[], cacheMisses: boolean): Promise<Found> {
    const answers = await musicBrainz.urls(forms, { cacheMisses });
    const targets = [...answers.values()].flat();
    const albums: AlbumCandidate[] = targets
      .filter((target) => target.kind === "release-group")
      .map((target) => ({ releaseGroupId: target.id, title: target.title }));
    const releases = [
      ...new Set(targets.filter((target) => target.kind === "release").map((target) => target.id)),
    ].slice(0, maxReleasesPerUrl);
    for (const release of releases) {
      // Each lookup waits its turn in MusicBrainz's queue anyway, and each is cached by MBID.
      // oxlint-disable-next-line no-await-in-loop
      const body = await musicBrainz.lookup("release", release, ["release-groups"]);
      const group = releaseGroupSchema.parse(body)["release-group"];
      if (group) albums.push({ releaseGroupId: group.id, title: group.title });
    }
    return albumsFound(albums);
  }

  /** Step 3: the albums of the releases whose barcode is one of the code's forms. */
  async function byBarcode(code: string, cacheMisses: boolean): Promise<Found> {
    const forms = barcodeForms(code);
    if (forms.length === 0) return undefined;
    const releases = await musicBrainz.barcodes(forms, { cacheMisses });
    return albumsFound(
      releases.map((release) => ({ releaseGroupId: release.releaseGroupId, title: release.title })),
    );
  }

  /** Step 4: the strict match. */
  async function byHints(hints: Hints): Promise<Found> {
    const match: HintMatch = await matchHints(musicBrainz, hints);
    if (match.kind === "one")
      return { kind: "one", album: { releaseGroupId: match.releaseGroupId, title: "" } };
    return match.kind === "several" ? { kind: "several", albums: match.albums } : undefined;
  }

  async function spotifyChain(link: ParsedLink): Promise<Identification> {
    // A track's album id comes from Spotify: it lives only here, and its misses are never cached (TS-41).
    let albumId = link.albumId;
    if (link.kind === "track") {
      if (!spotify) return unidentified(link, unidentifiedReasons.spotifyOff);
      albumId = await spotify.parentAlbum(link.id);
      if (!albumId) return unidentified(link, unidentifiedReasons.gone("spotify"));
    }
    if (!albumId) return unidentified(link, unidentifiedReasons.notFound);
    const fromSpotify = link.kind === "track";
    const step2 = answer(link, 2, await byUrls(urlForms("spotify", albumId), !fromSpotify));
    if (step2) return step2;
    if (spotify) {
      const upc = (await spotify.album(albumId))?.upc;
      const step3 = upc ? answer(link, 3, await byBarcode(upc, false)) : undefined;
      if (step3) return step3;
    }
    // Spotify's titles and artists are never hints (TS-41).
    return unidentified(link, unidentifiedReasons.notFound);
  }

  async function appleChain(link: ParsedLink): Promise<Identification> {
    const storefronts = [
      ...new Set([...(link.storefront ? [link.storefront] : []), ...appleLookupStorefronts]),
    ];
    let album: AppleAlbum | undefined;
    let albumId = link.albumId;
    if (!albumId) {
      // A `/song/` link: iTunes Lookup names the album the song belongs to, with the album's hints.
      album = await itunes.songAlbum(link.id, storefronts);
      if (!album) return unidentified(link, unidentifiedReasons.gone("apple-music"));
      albumId = album.albumId;
    }
    const forms = urlForms(
      "apple-music",
      albumId,
      link.storefront ? { storefront: link.storefront } : {},
    );
    const step2 = answer(link, 2, await byUrls(forms, true));
    if (step2) return step2;
    album ??= await itunes.album(albumId, storefronts);
    if (!album) return unidentified(link, unidentifiedReasons.notFound);
    const step4 = answer(link, 4, await byHints(album));
    if (step4) return step4;
    return unidentified(link, unidentifiedReasons.notFound, {
      source: "itunes-lookup",
      values: {
        title: cleanTitle(album.title),
        artistCredit: album.artist,
        originalYear: Number(album.date.slice(0, 4)),
      },
    });
  }

  async function qobuzChain(link: ParsedLink, { agent }: IdentifyContext): Promise<Identification> {
    if (link.kind === "track") return unidentified(link, unidentifiedReasons.trackOnly("qobuz"));
    const albumId = link.id;
    let { slug, locale } = link;
    let page: string | undefined;
    if (!slug) {
      // Request A, for open. and play. links. Agents' captures read only its `Location` (FR-10.5).
      const address = await pages.qobuzAddress(albumId, { readPage: !agent });
      slug = address?.slug;
      locale = address?.locale;
      page = address?.page;
    }
    const forms = urlForms("qobuz", albumId, {
      ...(slug ? { slug } : {}),
      ...(locale ? { locale } : {}),
    });
    const step2 = answer(link, 2, await byUrls(forms, true));
    if (step2) return step2;
    const barcode = qobuzBarcode(albumId);
    const step3 = barcode ? answer(link, 3, await byBarcode(barcode, true)) : undefined;
    if (step3) return step3;
    if (!agent && slug) {
      // Request B, or request A's answer when it was the page. The hints go to step 4 and nowhere else.
      const hints =
        page === undefined
          ? await pages.qobuzHints(albumId, slug, locale)
          : extractQobuzHints(page);
      const step4 = hints ? answer(link, 4, await byHints(hints)) : undefined;
      if (step4) return step4;
    }
    return unidentified(link, unidentifiedReasons.notFound);
  }

  async function tidalChain(link: ParsedLink, { agent }: IdentifyContext): Promise<Identification> {
    if (link.kind === "track") return unidentified(link, unidentifiedReasons.trackOnly("tidal"));
    const step2 = answer(link, 2, await byUrls(urlForms("tidal", link.id), true));
    if (step2) return step2;
    if (!agent) {
      const hints = await pages.tidalHints(link.id);
      const step4 = hints ? answer(link, 4, await byHints(hints)) : undefined;
      if (step4) return step4;
    }
    return unidentified(link, unidentifiedReasons.notFound);
  }

  async function youtubeChain(
    link: ParsedLink,
    { mayReadYouTube }: IdentifyContext,
  ): Promise<Identification> {
    // A track link names its album's playlist, which every YouTube Music link keeps.
    const albumId = link.albumId ?? link.id;
    const step2 = answer(link, 2, await byUrls(urlForms("youtube-music", albumId), true));
    if (step2) return step2;
    if (youtube && (await mayReadYouTube())) {
      // Held only here, for the search: nothing YouTube gives is kept or prefilled (TON-128).
      const hints = await youtube.albumHints(albumId);
      const step4 = hints ? answer(link, 4, await byHints(hints)) : undefined;
      if (step4) return step4;
    }
    return unidentified(link, unidentifiedReasons.notFound);
  }

  const chains: Record<
    StreamingService,
    (link: ParsedLink, context: IdentifyContext) => Promise<Identification>
  > = {
    spotify: spotifyChain,
    "apple-music": appleChain,
    qobuz: qobuzChain,
    tidal: tidalChain,
    "youtube-music": youtubeChain,
  };

  /**
   * Step 4's rule on the details an agent sent for a link no step identified (TON-111). They stand in for the store
   * page an agent's capture doesn't read (FR-10.5). The album, when exactly one passes.
   */
  async function matchDetails(details: AgentDetails): Promise<string | undefined> {
    const found = await byHints({
      title: details.title,
      artist: details.artistCredit,
      date: String(details.originalYear),
    });
    return found?.kind === "one" ? found.album.releaseGroupId : undefined;
  }

  /** What album `input`, as pasted, names (TS-41). */
  async function identify(input: string, context: IdentifyContext): Promise<Identification> {
    try {
      const parsed = await readLink(input, deps.fetch ?? safeFetch);
      if (parsed.status === "failed") return { status: "failed", failure: parsed.failure };
      const { link } = parsed;
      const albumId = await context.linked(link.service, linkEntityId(link));
      if (albumId) return { status: "linked", link, albumId };
      return await chains[link.service](link, context);
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) throw error;
      return { status: "failed", failure: unavailableFailure(error) };
    }
  }

  return { identify, matchDetails };
}

export type Identifier = ReturnType<typeof createIdentifier>;

/**
 * The answer in TS-27's vocabulary, for an app or an agent. Linked and identified links have none yet: the capture
 * goes on to matching and enrichment (TON-43, TON-44).
 */
export function identificationOutcome(identification: Identification): Outcome | undefined {
  if (identification.status === "ambiguous") {
    return { status: "needs_input", need: "match", candidates: identification.candidates };
  }
  if (identification.status === "unidentified") {
    const { link, reason, prefill } = identification;
    return {
      status: "needs_input",
      need: "details",
      candidates: [
        { service: link.service, url: link.url, reason, ...(prefill ? { prefill } : {}) },
      ],
    };
  }
  return identification.status === "failed" ? identification.failure : undefined;
}
