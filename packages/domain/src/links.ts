// The streaming services Tonaris links to, and when two links are the same (FR-06.2, FR-06.4, TS-40).
// Parsing pasted links is `@tonaris/providers`' job; this is the vocabulary every layer shares.

/** The services capture accepts and albums link to (FR-02.1, FR-06.2). */
export const streamingServices = ["spotify", "apple-music", "qobuz", "tidal"] as const;
export type StreamingService = (typeof streamingServices)[number];

/** Each service's name, as people read it: in reasons, and in "Open in…" (DS-25). */
export const serviceNames: Record<StreamingService, string> = {
  spotify: "Spotify",
  "apple-music": "Apple Music",
  qobuz: "Qobuz",
  tidal: "Tidal",
};

/** What a link names. A track link stands for the album it belongs to (FR-02.3). */
export const linkKinds = ["album", "track"] as const;
export type LinkKind = (typeof linkKinds)[number];

/** A link as identity: the service, what it names, and that thing's id there. */
export type LinkRef = { service: StreamingService; kind: LinkKind; id: string };

/**
 * Whether two links are the same link (FR-06.4, TS-40): the same service, kind and id, whatever their form,
 * storefront or parameters. Such variants never conflict.
 */
export function sameLink(a: LinkRef, b: LinkRef): boolean {
  return a.service === b.service && a.kind === b.kind && a.id === b.id;
}
