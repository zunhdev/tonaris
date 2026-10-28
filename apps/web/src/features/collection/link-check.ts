// Checking a typed link before it is sent (FR-06.2, FR-06.3, TS-40): parsed in the browser with the same allowlist
// the server reads it with, so the person sees the reason the server would give, at the field. A short link passes:
// only the server follows it.

import { wrongServiceReason, type StreamingService } from "@tonaris/domain";
import { parseLink } from "@tonaris/providers/links";

/** Why `text` can't be the album's link for `service`, if it can't. Empty text is no link, which is fine. */
export function checkLink(service: StreamingService, text: string): string | undefined {
  if (text.trim() === "") return undefined;
  const parsed = parseLink(text);
  if (parsed.status === "failed") return parsed.failure.problem.detail;
  // Short links are Spotify's only (TS-40).
  const found = parsed.status === "short" ? "spotify" : parsed.link.service;
  return found === service ? undefined : wrongServiceReason(found, service);
}
