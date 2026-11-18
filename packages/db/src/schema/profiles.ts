// A person's favorite albums (FR-11.16, TON-297): up to four of their own albums, in order. An album's purge removes
// its row through the cascade; account deletion removes the person's rows before the account (TS-74).

import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { maxFavorites } from "@tonaris/domain";

import { users } from "./auth";
import { albums } from "./collection";
import { table, timestamps } from "./columns";

export const profileFavorites = table(
  "profile_favorites",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id),
    albumId: uuid()
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.albumId] }),
    uniqueIndex("profile_favorites_position_key").on(t.userId, t.position),
    index().on(t.albumId),
    check(
      "profile_favorites_position_check",
      sql`${t.position} >= 0 and ${t.position} < ${sql.raw(String(maxFavorites))}`,
    ),
  ],
);
