// What capture says (DS-48, DS-107): the toast a single capture's result raises, the reason a capture waits for the
// person, and the choices it offers, read from `album.capture`'s outcomes (TON-44). Pure, so the wording is tested
// without a DOM.

import { z } from "zod";

import {
  albumFieldsSchema,
  captureResultSchema,
  serviceNames,
  streamingServices,
  type CaptureResult,
  type Outcome,
} from "@tonaris/domain";

/** A candidate of a `match` answer: a MusicBrainz album, and the owner's album already saved as it, if any. */
const matchCandidateSchema = z.object({
  releaseGroupId: z.string(),
  title: z.string(),
  albumId: z.string().nullable(),
});
export type MatchCandidate = z.infer<typeof matchCandidateSchema>;

/** The candidate of a `details` answer: the link, why details are needed, and what manual entry is prefilled with. */
const detailsCandidateSchema = z.object({
  service: z.enum(streamingServices),
  url: z.string(),
  reason: z.string(),
  prefill: z.object({ source: z.string(), values: albumFieldsSchema.partial() }).optional(),
});
export type DetailsCandidate = z.infer<typeof detailsCandidateSchema>;

/** What a capture waiting for the person asks: a choice between albums, or the album's details. */
export type CaptureNeed =
  | { need: "match"; candidates: MatchCandidate[] }
  | { need: "details"; details: DetailsCandidate | undefined };

/** What `outcome` asks of the person, if it is a capture's `needs_input`. */
export function captureNeed(outcome: Outcome | undefined): CaptureNeed | undefined {
  if (outcome?.status !== "needs_input") return undefined;
  if (outcome.need === "match") {
    return {
      need: "match",
      candidates: outcome.candidates.flatMap((each) => {
        const parsed = matchCandidateSchema.safeParse(each);
        return parsed.success ? [parsed.data] : [];
      }),
    };
  }
  if (outcome.need !== "details") return undefined;
  const parsed = detailsCandidateSchema.safeParse(outcome.candidates[0]);
  return { need: "details", details: parsed.success ? parsed.data : undefined };
}

const fitsSeveral = "This link fits more than one album. Choose which it is.";
const needsDetails = "Tonaris needs this album's details. Enter them; the link is kept.";

/** Why a capture waits for the person, in words (DS-48). */
export function needReason(outcome: Outcome | undefined): string | undefined {
  const need = captureNeed(outcome);
  if (!need) return undefined;
  return need.need === "match" ? fitsSeveral : (need.details?.reason ?? needsDetails);
}

/** The confirmed result of a capture, if `outcome` is one. */
export function captureResult(outcome: Outcome | undefined): CaptureResult | undefined {
  if (outcome?.status !== "confirmed") return undefined;
  const parsed = captureResultSchema.safeParse(outcome.result);
  return parsed.success ? parsed.data : undefined;
}

export type OutcomeToast = {
  title: string;
  /** "Add to list…": the album went to Unsorted from a view that doesn't show it. */
  addToList?: boolean;
};

/**
 * The toast for a single capture's result (DS-48), or none: a new album whose row was on screen just appears.
 * `listName` is the destination's name, if it had one; `shown`, whether the view on screen is the destination.
 */
export function confirmedToast(
  result: CaptureResult,
  { title, listName, shown }: { title: string; listName: string | null; shown: boolean },
): OutcomeToast | undefined {
  const intoList = listName !== null;
  const addToList = intoList ? {} : { addToList: true };
  if (result.alreadyInList) return { title: "Already in this list" };
  if (result.match === "restored") {
    return {
      title: intoList ? "Restored from Trash and added" : "Restored from Trash",
      ...addToList,
    };
  }
  if (result.match === "reused") {
    return {
      title: intoList
        ? "Already in your collection — added to this list"
        : "Already in your collection",
      ...addToList,
    };
  }
  if (shown) return undefined;
  return intoList
    ? { title: `Added '${title}' to '${listName}'` }
    : { title: `Added '${title}' to Unsorted`, addToList: true };
}

/** The toast for a link kept instead of the pasted one (FR-06.4). */
export function keptLinkToast({ service }: NonNullable<CaptureResult["keptLink"]>): string {
  return `Kept your existing ${serviceNames[service]} link`;
}

/** A capture's failure toast (DS-48, DS-80): a single capture made on its own that didn't save. */
export const failedTitle = "Couldn't add an album from this link";

/** A capture's toast when it waits for the person. */
export function needTitle(need: CaptureNeed): string {
  return need.need === "match" ? "Choose which album this link is" : "Add this album's details";
}

/** A link as people read it: its host and path, without the scheme. */
export function shownLink(link: string): string {
  try {
    const { host, pathname, search } = new URL(link);
    return `${host}${pathname}${search}`;
  } catch {
    return link;
  }
}
