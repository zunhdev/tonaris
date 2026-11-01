// A problem in words (FR-13.1, DS-107): what the save states, toasts and pages say when the server refuses, plain
// and blameless, with one way forward. The server's own explanation comes first; a code's sentence is for when it
// gives none.

import type { ErrorCode, Problem } from "@tonaris/domain";

/**
 * What each failure means when the server gives no explanation (FR-13.1, DS-107): plain and blameless, with one
 * way forward. A code added later falls back to the general sentence (TS-09).
 */
const codeReasons: Record<ErrorCode, string> = {
  validation_failed: "Some of this isn't valid. Check it and try again.",
  required_missing: "Some required information is missing. Fill it in and try again.",
  name_conflict: "That name is already used here. Choose another name.",
  capacity_exceeded:
    "Your collection is full. Permanently delete albums from Trash or remove albums to add more.",
  limit_exceeded: "This would go past a limit. Remove something first, then try again.",
  unauthenticated: "You're signed out. Sign in again to save this change.",
  permission_denied: "You can't change this.",
  app_only: "This can only be changed in the Tonaris app.",
  not_found: "This no longer exists, so it can't be changed.",
  trashed: "This is in Trash. Recover it to change it.",
  cycle: "A folder can't go inside itself or a folder inside it. Choose another folder.",
  invalid_destination: "That place isn't available. Choose another folder or the top level.",
  field_in_use: "This field is still used. Remove it from its albums first.",
  uncertain_match: "Tonaris isn't sure this is the same album. Choose whether it is.",
  unsupported_link:
    "This doesn't look like a Spotify, Apple Music, Qobuz, Tidal or YouTube Music album or track link.",
  provider_unavailable:
    "Couldn't reach the music service. Try again, or enter the details manually.",
  rate_limited: "Too many changes at once. Wait a moment, then retry.",
  expired: "This change is too old to be retried. Check what's saved, then make it again.",
  in_progress: "This change is still being saved. Wait a moment, then check again.",
  recipient_not_found: "No Tonaris account uses this email. Share a link instead.",
  display_name_required: "Add a display name first: people you share with see it.",
  internal_error: "Tonaris couldn't save this change. Try again.",
};

/**
 * A problem's sentence: its `detail`, written for people, or else `fallback`. Given a code instead, what the code
 * means, or else `fallback` for a code added later (TS-09).
 */
export function problemSentence(
  problem: Problem | ErrorCode | undefined,
  fallback: string,
): string {
  if (problem === undefined) return fallback;
  if (typeof problem === "string") return codeReasons[problem] ?? fallback;
  return problem.detail || fallback;
}
