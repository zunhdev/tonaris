// How the save-state interface names a write (DS-80, DS-81, DS-107): a summary for Activity, what couldn't be
// saved for a failure, and the record a conflict is about. Names come from the collections as they are now, falling
// back to the write itself for a record that was rolled back, such as a list whose creation failed. Plain and
// specific, names in single quotes.

import { shownLink } from "@/features/capture/outcomes";
import { fieldTypeNames } from "@/features/collection/field-types";

import {
  serviceNames,
  type Container,
  type ContainerKind,
  type ErrorCode,
  type Mutation,
  type Outcome,
  type OutcomeStatus,
} from "@tonaris/domain";

/** The names the collections hold now. */
export type Names = {
  album(id: string): string | undefined;
  container(id: string): Pick<Container, "name" | "kind"> | undefined;
  /** A Trash unit's name, by ID (TON-55). */
  trashUnit?(id: string): string | undefined;
  /** A custom field's name, and an option's label, by ID (TON-50). */
  field?(id: string): string | undefined;
  option?(id: string): string | undefined;
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

/** A view by name: Collection, Unsorted, or "'Doom'". */
function viewNamed(viewKey: string, names: Names): string {
  if (viewKey === "root") return "Collection";
  if (viewKey === "unsorted") return "Unsorted";
  return quoted(names.container(viewKey)?.name, "a folder or list");
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a conflicting field is an item's place in an arrangement: its field is the item's ID (TS-16). */
const isPlace = (field: string) => uuidPattern.test(field);

export function describeWrite(mutation: Mutation, names: Names): Described {
  if (mutation.name === "album.create") {
    const title = quoted(mutation.args.title, "an album");
    return { summary: `Add ${title}`, what: title, subject: capitalized(title) };
  }
  if (mutation.name === "album.capture") {
    // Until saved, a capture is told apart by its link (DS-48).
    const title = quoted(
      names.album(mutation.args.albumId),
      `an album from ${shownLink(mutation.args.link)}`,
    );
    return { summary: `Add ${title}`, what: title, subject: capitalized(title) };
  }
  if (mutation.name === "album.update") {
    const title = quoted(mutation.base.title ?? names.album(mutation.args.id), "an album");
    return { summary: `Edit ${title}`, what: `changes to ${title}`, subject: capitalized(title) };
  }
  if (mutation.name === "album.setArtwork") {
    const title = quoted(names.album(mutation.args.id), "an album");
    return {
      summary: `Change the artwork of ${title}`,
      what: `the artwork of ${title}`,
      subject: capitalized(`the artwork of ${title}`),
    };
  }
  if (mutation.name === "field.create") {
    const { name } = mutation.args;
    return { summary: `New field '${name}'`, what: `the field '${name}'`, subject: `'${name}'` };
  }
  if (mutation.name === "field.rename") {
    const seen = `'${mutation.base.name}'`;
    return {
      summary: `Rename field ${seen} to '${mutation.args.name}'`,
      what: `the new name for the field ${seen}`,
      subject: `The field ${seen}`,
    };
  }
  if (mutation.name === "field.delete") {
    const field = quoted(names.field?.(mutation.args.id), "a field");
    return {
      summary: `Delete field ${field}`,
      what: `the deletion of ${field}`,
      subject: capitalized(`field ${field}`),
    };
  }
  if (
    mutation.name === "field.changeType" ||
    mutation.name === "field.addOption" ||
    mutation.name === "field.renameOption" ||
    mutation.name === "field.removeOption"
  ) {
    const fieldId = mutation.name === "field.changeType" ? mutation.args.id : mutation.args.fieldId;
    const field = quoted(names.field?.(fieldId), "a field");
    if (mutation.name === "field.changeType") {
      const type = fieldTypeNames[mutation.args.type];
      return {
        summary: `Change ${field} to ${type}`,
        what: `the type of ${field}`,
        subject: capitalized(`the type of ${field}`),
      };
    }
    if (mutation.name === "field.addOption") {
      const option = quoted(mutation.args.label, "an option");
      return {
        summary: `Add option ${option} to ${field}`,
        what: `option ${option} of ${field}`,
        subject: capitalized(`option ${option} of ${field}`),
      };
    }
    if (mutation.name === "field.renameOption") {
      const option = quoted(mutation.base.label, "an option");
      return {
        summary: `Rename option ${option} to ${quoted(mutation.args.label, "a new label")}`,
        what: `the label of ${option} in ${field}`,
        subject: capitalized(`option ${option} of ${field}`),
      };
    }
    const option = quoted(names.option?.(mutation.args.optionId), "an option");
    return {
      summary: `Remove option ${option} from ${field}`,
      what: `the removal of ${option} from ${field}`,
      subject: capitalized(`option ${option} of ${field}`),
    };
  }
  if (
    mutation.name === "fieldValue.apply" ||
    mutation.name === "fieldValue.set" ||
    mutation.name === "fieldValue.remove"
  ) {
    const album = quoted(names.album(mutation.args.albumId), "an album");
    const field = quoted(names.field?.(mutation.args.fieldId), "a field");
    const subject = capitalized(`${field} of ${album}`);
    if (mutation.name === "fieldValue.apply") {
      return { summary: `Add ${field} to ${album}`, what: `${field} on ${album}`, subject };
    }
    if (mutation.name === "fieldValue.remove") {
      return {
        summary: `Remove ${field} from ${album}`,
        what: `the removal of ${field} from ${album}`,
        subject,
      };
    }
    return {
      summary: `Set ${field} of ${album}`,
      what: `the value of ${field} for ${album}`,
      subject,
    };
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
  if (mutation.name === "container.delete") {
    const deleted = names.container(mutation.args.id);
    const target = kindNamed(deleted?.kind, deleted?.name);
    return {
      summary: capitalized(`delete ${target}`),
      what: `the deletion of ${target}`,
      subject: capitalized(target),
    };
  }
  if (mutation.name === "trash.purge") {
    const count = mutation.args.unitIds.length;
    const items = `${count} ${count === 1 ? "item" : "items"}`;
    return {
      summary: `Delete ${items} from Trash permanently`,
      what: `the permanent deletion of ${items}`,
      subject: capitalized(items),
    };
  }
  if (mutation.name === "album.delete") {
    const title = quoted(names.album(mutation.args.id), "an album");
    return {
      summary: `Delete ${title} from the collection`,
      what: `the deletion of ${title}`,
      subject: capitalized(title),
    };
  }
  if (mutation.name === "trash.recover") {
    const name = names.trashUnit?.(mutation.args.unitId);
    const target = quoted(name, "an item");
    return {
      summary: `Recover ${target} from Trash`,
      what: `the recovery of ${target}`,
      subject: capitalized(target),
    };
  }
  if (mutation.name === "container.describe") {
    const described = names.container(mutation.args.id);
    const target = kindNamed(described?.kind, described?.name);
    return {
      summary: capitalized(
        mutation.args.description === null
          ? `clear the description of ${target}`
          : `describe ${target}`,
      ),
      what: `the description of ${target}`,
      subject: capitalized(`the description of ${target}`),
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
  if (mutation.name === "view.set") {
    const view = viewNamed(mutation.args.viewKey, names);
    return {
      summary: `View options for ${view}`,
      what: `the view options for ${view}`,
      subject: `The view options for ${view}`,
    };
  }
  if (mutation.name === "defaults.set") {
    return {
      summary: "Default view options",
      what: "your default view options",
      subject: "Your default view options",
    };
  }
  if (mutation.name === "link.set" || mutation.name === "link.remove") {
    const title = quoted(names.album(mutation.args.albumId), "an album");
    const link = `the ${serviceNames[mutation.args.service]} link`;
    const subject = capitalized(`${link} of ${title}`);
    if (mutation.name === "link.remove") {
      return {
        summary: `Remove ${link} from ${title}`,
        what: `the removal of ${link} from ${title}`,
        subject,
      };
    }
    return mutation.base.url === null
      ? { summary: `Add ${link} to ${title}`, what: `${link} for ${title}`, subject }
      : { summary: `Replace ${link} of ${title}`, what: `the new ${link} for ${title}`, subject };
  }
  if (mutation.name === "order.set") {
    const view = viewNamed(mutation.args.viewKey, names);
    return {
      summary: `Arrange ${view}`,
      what: `the order of ${view}`,
      subject: `The order of ${view}`,
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
  in_progress: "This change is still being saved. Wait a moment, then check again.",
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
  artworkUrl: "Artwork",
  name: "Name",
  parentId: "Location",
  url: "Link",
  value: "Value",
  sortMode: "Sort",
  sortDir: "Direction",
  grouped: "Grouping",
  layout: "Layout",
  listSortMode: "Sort for lists",
  listSortDir: "Direction for lists",
  folderSortMode: "Sort for folders",
  folderSortDir: "Direction for folders",
};

/** A conflicting field's name in the review (DS-80): an item's place is named by the item. */
export function fieldLabel(field: string, names?: Names): string {
  if (isPlace(field)) {
    const name = names?.album(field) ?? names?.container(field)?.name;
    return name === undefined ? "Place of an item" : `Place of '${name}'`;
  }
  return fieldLabels[field] ?? field;
}

const releaseTypeLabels: Record<string, string> = {
  album: "Album",
  ep: "EP",
  compilation: "Compilation",
};

/** The words for view options' values (DS-49). */
const presentationValues: Record<string, string> = {
  year: "Year",
  name: "Name",
  created: "Created",
  manual: "Manual",
  asc: "Ascending",
  desc: "Descending",
  rows: "Rows",
  grid: "Grid",
};

const presentationFields = new Set([
  "sortMode",
  "sortDir",
  "grouped",
  "layout",
  "listSortMode",
  "listSortDir",
  "folderSortMode",
  "folderSortDir",
]);

/**
 * A conflicting field's value in the review: "—" when empty, folders by name, the root as "Collection", a view
 * choice in words, "Account default" when not made, and an item's place as where it is or where the person put it
 * (`side`), since its key means nothing to people.
 */
export function fieldValue(
  field: string,
  value: unknown,
  names: Names,
  side: "current" | "attempted" = "current",
): string {
  if (isPlace(field)) {
    if (value === null || value === undefined) return "Not arranged";
    return side === "current" ? "Placed elsewhere" : "Your place";
  }
  if (presentationFields.has(field)) {
    if (value === null || value === undefined) return "Account default";
    if (field === "grouped") return value === true ? "Release type" : "None";
    return typeof value === "string" ? (presentationValues[value] ?? value) : "—";
  }
  if (field === "parentId") {
    if (value === null) return "Collection";
    return (typeof value === "string" && names.container(value)?.name) || "A folder no longer here";
  }
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // A custom field's choice: its options' labels (TON-50).
  if (field === "value" && Array.isArray(value)) {
    return value
      .map((id) => (typeof id === "string" && names.option?.(id)) || "An option")
      .join(", ");
  }
  if (field === "value" && typeof value === "string" && names.option?.(value)) {
    return names.option(value) ?? value;
  }
  if (field === "releaseType" && typeof value === "string") {
    return releaseTypeLabels[value] ?? value;
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}
