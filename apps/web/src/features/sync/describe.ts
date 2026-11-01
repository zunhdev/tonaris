// How the save-state interface names a write (DS-80, DS-81, DS-107): a summary for Activity, what couldn't be
// saved for a failure, and the record a conflict is about. Names come from the collections as they are now, falling
// back to the write itself for a record that was rolled back, such as a list whose creation failed. Plain and
// specific, names in single quotes.

import { shownLink } from "@/features/capture/outcomes";
import { fieldTypeNames } from "@/features/collection/field-types";

import {
  groupNames,
  isUuid,
  serviceNames,
  streamingServices,
  viewDefaultsFields,
  viewPrefsFields,
  type Container,
  type ContainerKind,
  type Mutation,
  type Outcome,
  type OutcomeStatus,
} from "@tonaris/domain";

import { problemSentence } from "./problems";

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

/** Whether a conflicting field is an item's place in an arrangement: its field is the item's ID (TS-16). */
const isPlace = (field: string) => isUuid(field);

export function describeWrite(mutation: Mutation, names: Names): Described {
  switch (mutation.name) {
    case "album.create": {
      const title = quoted(mutation.args.title, "an album");
      return { summary: `Add ${title}`, what: title, subject: capitalized(title) };
    }
    case "album.capture": {
      // Until saved, a capture is told apart by its link (DS-48).
      const title = quoted(
        names.album(mutation.args.albumId),
        `an album from ${shownLink(mutation.args.link)}`,
      );
      return { summary: `Add ${title}`, what: title, subject: capitalized(title) };
    }
    case "album.update": {
      const title = quoted(mutation.base.title ?? names.album(mutation.args.id), "an album");
      return { summary: `Edit ${title}`, what: `changes to ${title}`, subject: capitalized(title) };
    }
    case "album.setArtwork": {
      const title = quoted(names.album(mutation.args.id), "an album");
      return {
        summary: `Change the artwork of ${title}`,
        what: `the artwork of ${title}`,
        subject: capitalized(`the artwork of ${title}`),
      };
    }
    case "field.create": {
      const { name } = mutation.args;
      return { summary: `New field '${name}'`, what: `the field '${name}'`, subject: `'${name}'` };
    }
    case "field.rename": {
      const seen = `'${mutation.base.name}'`;
      return {
        summary: `Rename field ${seen} to '${mutation.args.name}'`,
        what: `the new name for the field ${seen}`,
        subject: `The field ${seen}`,
      };
    }
    case "field.delete": {
      const field = quoted(names.field?.(mutation.args.id), "a field");
      return {
        summary: `Delete field ${field}`,
        what: `the deletion of ${field}`,
        subject: capitalized(`field ${field}`),
      };
    }
    case "field.changeType":
    case "field.addOption":
    case "field.renameOption":
    case "field.removeOption": {
      const fieldId =
        mutation.name === "field.changeType" ? mutation.args.id : mutation.args.fieldId;
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
    case "fieldValue.apply":
    case "fieldValue.set":
    case "fieldValue.remove": {
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
    case "container.create": {
      const { kind, name } = mutation.args;
      return {
        summary: `New ${kind} '${name}'`,
        what: kindNamed(kind, name),
        subject: `'${name}'`,
      };
    }
    case "container.rename": {
      const { kind } = names.container(mutation.args.id) ?? {};
      const seen = `'${mutation.base.name}'`;
      return {
        summary: `Rename ${seen} to '${mutation.args.name}'`,
        what: `the new name for ${kindNamed(kind, mutation.base.name)}`,
        subject: seen,
      };
    }
    case "container.delete": {
      const deleted = names.container(mutation.args.id);
      const target = kindNamed(deleted?.kind, deleted?.name);
      return {
        summary: capitalized(`delete ${target}`),
        what: `the deletion of ${target}`,
        subject: capitalized(target),
      };
    }
    case "share.invite": {
      const container = quoted(
        names.container(mutation.args.containerId)?.name,
        "a folder or list",
      );
      return {
        summary: `Invite ${mutation.args.email} to ${container}`,
        what: `the invitation to ${container}`,
        subject: capitalized(`the invitation to ${container}`),
      };
    }
    case "share.setLink": {
      const container = quoted(
        names.container(mutation.args.containerId)?.name,
        "a folder or list",
      );
      const turn = mutation.args.enabled ? "on" : "off";
      return {
        summary: `Turn ${turn} the link to ${container}`,
        what: `the link to ${container}`,
        subject: capitalized(`the link to ${container}`),
      };
    }
    case "share.resendInvitation": {
      return {
        summary: "Send an invitation again",
        what: "the invitation's email",
        subject: "The invitation's email",
      };
    }
    case "share.accept":
    case "share.decline": {
      const verb = mutation.name === "share.accept" ? "Accept" : "Decline";
      return {
        summary: `${verb} an invitation`,
        what: "the invitation",
        subject: "The invitation",
      };
    }
    case "share.saveLink": {
      return {
        summary: "Add to Shared with me",
        what: "adding to Shared with me",
        subject: "Adding to Shared with me",
      };
    }
    case "share.removeReference": {
      return {
        summary: "Remove from Shared with me",
        what: "removing from Shared with me",
        subject: "Removing from Shared with me",
      };
    }
    case "share.leave": {
      return { summary: "Leave a share", what: "leaving the share", subject: "Leaving the share" };
    }
    case "share.revoke": {
      return { summary: "Remove someone's access", what: "the removal", subject: "The removal" };
    }
    case "account.setDisplayName": {
      return {
        summary: "Change your display name",
        what: "your display name",
        subject: "Your display name",
      };
    }
    case "trash.purge": {
      const count = mutation.args.unitIds.length;
      const items = `${count} ${count === 1 ? "item" : "items"}`;
      return {
        summary: `Delete ${items} from Trash permanently`,
        what: `the permanent deletion of ${items}`,
        subject: capitalized(items),
      };
    }
    case "album.delete": {
      const title = quoted(names.album(mutation.args.id), "an album");
      return {
        summary: `Delete ${title} from the collection`,
        what: `the deletion of ${title}`,
        subject: capitalized(title),
      };
    }
    case "trash.recover": {
      const name = names.trashUnit?.(mutation.args.unitId);
      const target = quoted(name, "an item");
      return {
        summary: `Recover ${target} from Trash`,
        what: `the recovery of ${target}`,
        subject: capitalized(target),
      };
    }
    case "container.describe": {
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
    case "container.move": {
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
    case "view.set": {
      const view = viewNamed(mutation.args.viewKey, names);
      return {
        summary: `View options for ${view}`,
        what: `the view options for ${view}`,
        subject: `The view options for ${view}`,
      };
    }
    case "defaults.set": {
      return {
        summary: "Default view options",
        what: "your default view options",
        subject: "Your default view options",
      };
    }
    case "defaults.setLinkTarget": {
      return {
        summary: "Where links open",
        what: "where your links open",
        subject: "Where your links open",
      };
    }
    case "defaults.setHiddenServices": {
      return {
        summary: "Your streaming services",
        what: "your streaming services",
        subject: "Your streaming services",
      };
    }
    case "link.set":
    case "link.remove": {
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
    case "order.set": {
      const view = viewNamed(mutation.args.viewKey, names);
      return {
        summary: `Arrange ${view}`,
        what: `the order of ${view}`,
        subject: `The order of ${view}`,
      };
    }
    case "membership.add":
    case "membership.remove": {
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
    default:
      return mutation satisfies never;
  }
}

const generalReason = "Tonaris couldn't save this change. Try again.";

/**
 * Why a failed write wasn't saved (FR-13.1, DS-107): the server's explanation, written for people, or else what
 * its code means.
 */
export function reasonOf(outcome: Outcome | undefined): string {
  if (outcome?.status !== "failed") return generalReason;
  return problemSentence(outcome.problem, problemSentence(outcome.code, generalReason));
}

/** Why a write made again can't be saved: its record is gone (DS-80, DS-84). */
export const goneReason = "It no longer exists, so it can't be saved again.";

/** A count of changes: "1 change", "3 changes". */
export const changes = (n: number) => (n === 1 ? "1 change" : `${n} changes`);

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

/** The fields a conflict names: each mutation's `base` keys (TS-21), but an arrangement's, which are item IDs. */
type BaseField =
  Exclude<Mutation, { name: "order.set" }> extends infer Each
    ? Each extends { base: infer Base }
      ? keyof Base
      : never
    : never;

/** Conflicting fields by name; one without falls back to its key. */
const fieldLabels: Partial<Record<string, string>> = {
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
  linkTarget: "Open links in",
  hiddenServices: "Streaming services",
} satisfies Partial<Record<BaseField, string>>;

/** A conflicting field's name in the review (DS-80): an item's place is named by the item. */
export function fieldLabel(field: string, names?: Names): string {
  if (isPlace(field)) {
    const name = names?.album(field) ?? names?.container(field)?.name;
    return name === undefined ? "Place of an item" : `Place of '${name}'`;
  }
  return fieldLabels[field] ?? field;
}

/** Release types in words, as their groups are named (DS-43). */
const releaseTypeNames: Partial<Record<string, string>> = groupNames;

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

/** A view's choices and the account defaults for views (FR-11.7). */
const presentationFields = new Set<string>([...viewPrefsFields, ...viewDefaultsFields]);

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
  if (field === "linkTarget") return value === "app" ? "App" : "Web page";
  // The services turned off, named; none off means all on (TON-138).
  if (field === "hiddenServices" && Array.isArray(value)) {
    const off = streamingServices
      .filter((service) => value.includes(service))
      .map((service) => serviceNames[service]);
    return off.length === 0 ? "All on" : `Off: ${off.join(", ")}`;
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
    return releaseTypeNames[value] ?? value;
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}
