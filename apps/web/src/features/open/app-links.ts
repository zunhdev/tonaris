// A service's desktop app link for a canonical URL (TS-43; the desktop app-scheme spike of 28 October 2026): the URI
// its app registers, naming the same album or track. The web page stays the primary action on desktop; the app is
// the person's second, explicit choice of the same service (FR-06.5, FR-06.6).

import { parseLink } from "@tonaris/providers/links";

/**
 * The app's URI for the release `url` names, or undefined when it names none Tonaris can read, or its service has no
 * desktop app: YouTube Music's links open its page whatever the setting (TS-43, TON-131).
 */
export function appLink(url: string): string | undefined {
  const parsed = parseLink(url);
  if (parsed.status !== "parsed") return undefined;
  const { service, kind, id } = parsed.link;
  if (service === "spotify") return `spotify:${kind}:${id}`;
  // Apple's canonical URL keeps its storefront, which Music needs.
  if (service === "apple-music") return parsed.link.url.replace(/^https:/, "music:");
  if (service === "qobuz") return `qobuzapp://${kind}/${id}`;
  if (service === "tidal") return `tidal://${kind}/${id}`;
  return undefined;
}
