// Personal presentation: remembered view choices, account defaults and manual order (TS-11, TS-16; FR-05.2,
// FR-11.7). Person and account columns reference `user` with NO ACTION, like owner columns (TS-74).

import { sql } from "drizzle-orm";
import { boolean, check, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import {
  folderSortModes,
  listSortModes,
  sortDirections,
  sortModes,
  viewLayouts,
} from "@tonaris/domain";

import { users } from "./auth";
import { oneOf, table, timestamps } from "./columns";

/**
 * A person's remembered choices for one view: `root`, `unsorted` or a container id. A null column falls back
 * to the account default (FR-11.7). The sort is one choice, so its mode and direction are set and cleared together.
 */
export const viewPrefs = table(
  "view_prefs",
  {
    personId: uuid()
      .notNull()
      .references(() => users.id),
    viewKey: text().notNull(),
    sortMode: text({ enum: sortModes }),
    sortDir: text({ enum: sortDirections }),
    grouped: boolean(),
    layout: text({ enum: viewLayouts }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.viewKey] }),
    check("view_prefs_sort_mode_check", oneOf(t.sortMode, sortModes)),
    check("view_prefs_sort_dir_check", oneOf(t.sortDir, sortDirections)),
    check("view_prefs_sort_check", sql`(${t.sortMode} is null) = (${t.sortDir} is null)`),
    check("view_prefs_layout_check", oneOf(t.layout, viewLayouts)),
  ],
);

/**
 * A person's account defaults (FR-11.7, DS-94), complete once saved. No row means DS-44's first-time defaults
 * (`appViewDefaults` in packages/domain).
 */
export const accountSettings = table(
  "account_settings",
  {
    accountId: uuid()
      .primaryKey()
      .references(() => users.id),
    listSortMode: text({ enum: listSortModes }).notNull(),
    listSortDir: text({ enum: sortDirections }).notNull(),
    folderSortMode: text({ enum: folderSortModes }).notNull(),
    folderSortDir: text({ enum: sortDirections }).notNull(),
    grouped: boolean().notNull(),
    layout: text({ enum: viewLayouts }).notNull(),
    ...timestamps,
  },
  (t) => [
    check("account_settings_list_sort_mode_check", oneOf(t.listSortMode, listSortModes)),
    check("account_settings_list_sort_dir_check", oneOf(t.listSortDir, sortDirections)),
    check("account_settings_folder_sort_mode_check", oneOf(t.folderSortMode, folderSortModes)),
    check("account_settings_folder_sort_dir_check", oneOf(t.folderSortDir, sortDirections)),
    check("account_settings_layout_check", oneOf(t.layout, viewLayouts)),
  ],
);

/** Personal manual order, one row per moved item, for owners and signed-in viewers alike (TS-16). */
export const positions = table(
  "positions",
  {
    personId: uuid()
      .notNull()
      .references(() => users.id),
    viewKey: text().notNull(),
    itemId: uuid().notNull(),
    // Fractional index. Compare bytewise (JS `<`, or SQL `COLLATE "C"`), never by the database locale.
    key: text().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.personId, t.viewKey, t.itemId] })],
);
