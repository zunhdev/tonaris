// Facts Help's pages show from the app's own code, so a page can't fall out of step with it (TS-136): limits here;
// the keyboard shortcuts (shortcuts.tsx) and the AI clients' setup steps (connect-guide.tsx) beside it.

import {
  maxAboutLength,
  maxAlbums,
  maxAlbumTextLength,
  maxBatchItems,
  maxCapturesPerHour,
  maxContainerDepth,
  maxContainers,
  maxDescriptionLength,
  maxExportsPerHour,
  maxFavorites,
  maxFieldOptions,
  maxFields,
  maxMemberships,
  maxNameLength,
  maxSavedReferences,
  maxTextValueLength,
  trashRetentionDays,
} from "@tonaris/domain";

const limits = {
  albums: maxAlbums,
  containers: maxContainers,
  depth: maxContainerDepth,
  memberships: maxMemberships,
  fields: maxFields,
  fieldOptions: maxFieldOptions,
  capturesPerHour: maxCapturesPerHour,
  exportsPerHour: maxExportsPerHour,
  batch: maxBatchItems,
  nameLength: maxNameLength,
  albumTextLength: maxAlbumTextLength,
  descriptionLength: maxDescriptionLength,
  aboutLength: maxAboutLength,
  favorites: maxFavorites,
  textValueLength: maxTextValueLength,
  savedReferences: maxSavedReferences,
  trashDays: trashRetentionDays,
} as const;

/** A limit's number, as a person reads it: `<Limit of="albums" />` is "50,000". */
export function Limit({ of }: { of: keyof typeof limits }) {
  return <>{limits[of].toLocaleString("en")}</>;
}
