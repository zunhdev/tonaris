// How the save-state interface names a write (DS-80, DS-81, DS-107): a summary for Activity, what couldn't be
// saved for a failure, and the record a conflict is about. Names come from the collections as they are now, falling
// back to the write itself for a record that was rolled back, such as a list whose creation failed. Plain and
// specific, names in single quotes.

import type {
  Container,
  ContainerKind,
  ErrorCode,
  Mutation,
  Outcome,
  OutcomeStatus,
} from "@tonaris/domain";

/** The names the collections hold now. */
export type Names = {
  album(id: string): string | undefined;
  container(id: string): Pick<Container, "name" | "kind"> | undefined;
};

export type Described = {
  /** For Activity: "Rename 'Metal' to 'Doom'". */
  summary: string;
  /** For "Couldn't save {what}": "the list 'Later'". */
  what: string;
  /** For "{subject} changed while you were editing": the record as the person last saw it. */
  subject: string;
};

const quoted = (name: string | undefined, otherwise: string) =>
  name === undefined ? otherwise : `'${name}'`;

/** "the list 'Later'", or "a list" without a name. */
const kindNamed = (kind: ContainerKind | undefined, name: string | undefined) =>
  name === undefined
    ? `a ${kind ?? "folder or list"}`
    : `the ${kind ?? "folder or list"} '${name}'`;

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function describeWrite(mutation: Mutation, names: Names): Described {
  if (mutation.name === "album.create") {
    const title = quoted(mutation.args.title, "an album");
    return { summary: `Add ${title}`, what: title, subject: capitalized(title) };
  }
  if (mutation.name === "album.update") {
    const title = quoted(mutation.base.title ?? names.album(mutation.args.id), "an album");
    return { summary: `Edit ${title}`, what: `changes to ${title}`, subject: capitalized(title) };
  }
  if (mutation.name === "container.create") {
    const { kind, name } = mutation.args;
    return {
      summary: `New ${kind} '${name}'`,
      what: kindNamed(kind, name),
      subject: `'${name}'`,
    };
  }
  if (mutation.name === "container.rename") {
    const { kind } = names.container(mutation.args.id) ?? {};
    const seen = `'${mutation.base.name}'`;
    return {
      summary: `Rename ${seen} to '${mutation.args.name}'`,
      what: `the new name for ${kindNamed(kind, mutation.base.name)}`,
      subject: seen,
    };
  }
  if (mutation.name === "container.move") {
    const moved = names.container(mutation.args.id);
    const { parentId } = mutation.args;
    const destination =
      parentId === null ? "Collection" : quoted(names.container(parentId)?.name, "a folder");
    return {
      summary: `Move ${quoted(moved?.name, `a ${moved?.kind ?? "folder or list"}`)} to ${destination}`,
      what: `the move of ${kindNamed(moved?.kind, moved?.name)}`,
      subject: capitalized(quoted(moved?.name, `a ${moved?.kind ?? "folder or list"}`)),
    };
  }
  const album = quoted(names.album(mutation.args.albumId), "an album");
  const list = quoted(names.container(mutation.args.listId)?.name, "a list");
  if (mutation.name === "membership.add") {
    return {
      summary: `Add ${album} to ${list}`,
      what: `${album} in ${list}`,
      subject: capitalized(`${album} in ${list}`),
    };
  }
  return {
    summary: `Remove ${album} from ${list}`,
    what: `the removal of ${album} from ${list}`,
    subject: capitalized(`${album} in ${list}`),
  };
}

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
    "This doesn't look like a Spotify, Apple Music, Qobuz or Tidal album or track link.",
  provider_unavailable:
    "Couldn't reach the music service. Try again, or enter the details manually.",
  rate_limited: "Too many changes at once. Wait a moment, then retry.",
  expired: "This change is too old to be retried. Check what's saved, then make it again.",
  internal_error: "Tonaris couldn't save this change. Try again.",
};

const generalReason = "Tonaris couldn't save this change. Try again.";

/**
 * Why a failed write wasn't saved (FR-13.1, DS-107): the server's explanation, written for people, or else what
 * its code means.
 */
export function reasonOf(outcome: Outcome | undefined): string {
  if (outcome?.status !== "failed") return generalReason;
  return outcome.problem.detail || (codeReasons[outcome.code] ?? generalReason);
}

/** A save state in words, beside its marker (DS-80, DS-84, DS-115). */
export const statusLabels: Record<OutcomeStatus, string> = {
  pending: "Saving…",
  unconfirmed: "Waiting to confirm",
  failed: "Couldn't save",
  conflict: "Changed elsewhere",
  skipped: "Skipped",
  needs_input: "Needs your choice",
  needs_approval: "Waiting for your approval",
  confirmed: "Saved",
};

const fieldLabels: Record<string, string> = {
  title: "Title",
  artistCredit: "Artist",
  releaseType: "Release type",
  isLive: "Live",
  originalYear: "Year",
  recordingYearStart: "Recorded from",
  recordingYearEnd: "Recorded until",
  name: "Name",
  parentId: "Location",
};

/** A conflicting field's name in the review (DS-80). */
export function fieldLabel(field: string): string {
  return fieldLabels[field] ?? field;
}

const releaseTypeLabels: Record<string, string> = {
  album: "Album",
  ep: "EP",
  compilation: "Compilation",
};

/** A conflicting field's value in the review: "—" when empty, folders by name, the root as "Collection". */
export function fieldValue(field: string, value: unknown, names: Names): string {
  if (field === "parentId") {
    if (value === null) return "Collection";
    return (typeof value === "string" && names.container(value)?.name) || "A folder no longer here";
  }
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field === "releaseType" && typeof value === "string") {
    return releaseTypeLabels[value] ?? value;
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}
