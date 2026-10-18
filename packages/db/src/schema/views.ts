// Personal presentation: remembered view choices and manual order (TS-11, TS-16; FR-05.2).
// Person columns reference `user` with NO ACTION, like owner columns (TS-74).

import { boolean, check, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { oneOf, table, timestamps } from "./columns";

export const sortDirections = ["asc", "desc"] as const;
export const viewLayouts = ["rows", "grid"] as const;

/**
 * A person's remembered choices for one view: `root`, `unsorted` or a container id. A null column falls back
 * to the account default (FR-11.7).
 */
export const viewPrefs = table(
  "view_prefs",
  {
    personId: uuid()
      .notNull()
      .references(() => users.id),
    viewKey: text().notNull(),
    sortMode: text(),
    sortDir: text({ enum: sortDirections }),
    grouped: boolean(),
    layout: text({ enum: viewLayouts }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.viewKey] }),
    check("view_prefs_sort_dir_check", oneOf(t.sortDir, sortDirections)),
    check("view_prefs_layout_check", oneOf(t.layout, viewLayouts)),
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
