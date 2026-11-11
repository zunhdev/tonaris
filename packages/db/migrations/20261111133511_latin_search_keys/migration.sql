-- Search keys gain Latin spellings (TON-201): "Кино" is stored as "kino", "Røyksopp" as "royksopp". Keys are computed
-- in TypeScript (TS-12), never in SQL, so this empties them all and the migrate command fills them in again after the
-- migrations (migrations.ts, `fillSearchKeys`).
UPDATE "containers" SET "search_name_key" = '';--> statement-breakpoint
UPDATE "albums" SET "search_title_key" = '', "search_artist_key" = '';
