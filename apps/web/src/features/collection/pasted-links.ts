// Links pasted onto the album open in the inspector (TON-160; DS-46, DS-48): with the panel open, ⌘V puts each pasted
// link in its service's row, instead of capturing a new album. Each is checked as a typed link is (TS-40), and the
// service is the link's own, so there's nothing to choose. One link per service: a refused one gives its reason and
// nothing is sent. A link the album already has changes nothing. Pure, so the rules are tested without a DOM.

import { serviceNames, type ServiceLink, type StreamingService } from "@tonaris/domain";
import { parseLink } from "@tonaris/providers/links";

/** A pasted link to save, as pasted, and the album's link it replaces, if it has one for the service. */
export type PastedLink = {
  service: StreamingService;
  url: string;
  replaces: ServiceLink | undefined;
};

export type PastePlan =
  | { kind: "save"; links: PastedLink[] }
  | { kind: "refuse"; reason: string }
  | { kind: "unchanged"; reason: string };

/** What pasting `pasted`, the paste's lines that look like links, does to an album with `existing` links. */
export function pastedLinks(
  pasted: readonly string[],
  existing: readonly ServiceLink[],
): PastePlan {
  const links = new Map(existing.map((link) => [link.service, link]));
  const seen = new Set<StreamingService>();
  const saved: PastedLink[] = [];
  for (const url of pasted) {
    const parsed = parseLink(url);
    if (parsed.status === "failed") {
      const { problem } = parsed.failure;
      return { kind: "refuse", reason: problem.detail ?? problem.title };
    }
    const service = parsed.status === "short" ? parsed.service : parsed.link.service;
    if (seen.has(service))
      return { kind: "refuse", reason: `Paste one ${serviceNames[service]} link at a time.` };
    seen.add(service);
    const replaces = links.get(service);
    // The album's links are canonical (FR-06.3), so the same page pasted again matches.
    const canonical = parsed.status === "short" ? parsed.url : parsed.link.url;
    if (replaces?.url !== canonical) saved.push({ service, url, replaces });
  }
  if (saved.length > 0) return { kind: "save", links: saved };
  const [only] = seen;
  return {
    kind: "unchanged",
    reason:
      seen.size === 1 && only !== undefined
        ? `The album already has this ${serviceNames[only]} link.`
        : "The album already has these links.",
  };
}

const names = new Intl.ListFormat("en", { type: "conjunction" });

/** What saving `links` says: "Added the Tidal link", "Replaced the Spotify and Tidal links", "Saved …" for both. */
export function savedTitle(links: readonly PastedLink[]): string {
  const replaced = links.filter((link) => link.replaces !== undefined).length;
  const verb = replaced === 0 ? "Added" : replaced === links.length ? "Replaced" : "Saved";
  const services = names.format(links.map((link) => serviceNames[link.service]));
  return `${verb} the ${services} ${links.length === 1 ? "link" : "links"}`;
}
