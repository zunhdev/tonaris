-- Server search (TS-50, TON-62). pg_trgm goes in `public`, where every schema's indexes can name its operator
-- class: test schemas are dropped with CASCADE, which would take an extension living in one of them along.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;--> statement-breakpoint
-- Search keys are computed in TypeScript (TS-12), never in SQL: existing rows start empty, and the migrate command
-- fills them in after the migrations (migrations.ts). Without a default, every write must set the key.
ALTER TABLE "containers" ADD COLUMN "search_name_key" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "containers" ALTER COLUMN "search_name_key" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "albums_search_title_key_trgm" ON "albums" USING gin ("search_title_key" public.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "albums_search_artist_key_trgm" ON "albums" USING gin ("search_artist_key" public.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "containers_search_name_key_trgm" ON "containers" USING gin ("search_name_key" public.gin_trgm_ops);
