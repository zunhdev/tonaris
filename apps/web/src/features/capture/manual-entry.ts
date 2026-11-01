// Manual entry from a capture (DS-47, DS-48; FR-02.3, FR-02.4): the form a capture's Enter manually opens. A capture
// that asked for the album's details, or whose candidates were none of these, opens it prefilled with what capture
// found, and saving completes the capture, which keeps the link and the sources of the values left as offered
// (TS-15). A failed capture opens it with the pasted link in its service's field, so the album is added with it.

import type { SaveState } from "@/client/sync/writer";
import { emptyForm, type AlbumForm } from "@/features/collection/album-form";
import type { NewAlbumDraft } from "@/features/collection/collection-ui";
import { reasonOf } from "@/features/sync/describe";

import type { AlbumFields } from "@tonaris/domain";
import { parseLink } from "@tonaris/providers/links";

import { captureNeed } from "./outcomes";

const noneOfThese = "None of the albums found. Enter this one's details; the link is kept.";

/** The form prefilled with capture's values, as typed text. */
function prefilled(values: Partial<AlbumFields> | undefined, listId: string | null): AlbumForm {
  const form = emptyForm(listId);
  if (!values) return form;
  const { recordingYearStart: start, recordingYearEnd: end } = values;
  return {
    ...form,
    title: values.title ?? "",
    artistCredit: values.artistCredit ?? "",
    releaseType: values.releaseType ?? null,
    isLive: values.isLive === true,
    originalYear: values.originalYear == null ? "" : String(values.originalYear),
    recording:
      start == null ? "" : end == null || end === start ? String(start) : `${start}–${end}`,
  };
}

/** The draft Enter manually opens for a capture that failed or waits for the person; none for anything else. */
export function captureDraft(state: SaveState): NewAlbumDraft | undefined {
  if (state.mutation.name !== "album.capture") return undefined;
  const { mutationId } = state.mutation;
  const { link, listId } = state.mutation.args;
  const need = captureNeed(state.outcome);
  if (need) {
    const details = need.need === "details" ? need.details : undefined;
    return {
      form: prefilled(details?.prefill?.values, listId),
      capture: { mode: "details", mutationId, link, reason: details?.reason ?? noneOfThese },
    };
  }
  if (state.status !== "failed") return undefined;
  const form = emptyForm(listId);
  const parsed = parseLink(link);
  // A short link names its service (TS-40); the form's check lets it through for the server to follow.
  const service =
    parsed.status === "parsed"
      ? parsed.link.service
      : parsed.status === "short"
        ? parsed.service
        : undefined;
  return {
    form: service === undefined ? form : { ...form, links: { ...form.links, [service]: link } },
    replaces: [mutationId],
    capture: { mode: "failed", mutationId, link, reason: reasonOf(state.outcome) },
  };
}
