// The limits Help's pages name (TS-136): the domain's own constants, so a page can't state an old number. Plain
// data, so the page list's generator reads it too, for search (scripts/help-pages.ts).

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

export const helpLimits = {
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

export type HelpLimit = keyof typeof helpLimits;

/** A limit as a person reads it: "50,000". */
export const limitText = (of: HelpLimit) => helpLimits[of].toLocaleString("en");
