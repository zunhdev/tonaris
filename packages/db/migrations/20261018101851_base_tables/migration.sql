CREATE TABLE "account_sync" (
	"account_id" uuid PRIMARY KEY,
	"seq" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album_field_multi" (
	"album_id" uuid,
	"field_id" uuid,
	"option_id" uuid,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_field_multi_pkey" PRIMARY KEY("album_id","field_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "album_field_values" (
	"album_id" uuid,
	"field_id" uuid,
	"text_value" text,
	"number_value" numeric,
	"date_value" date,
	"bool_value" boolean,
	"option_id" uuid,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_field_values_pkey" PRIMARY KEY("album_id","field_id"),
	CONSTRAINT "album_field_values_single_value_check" CHECK (num_nonnulls("text_value", "number_value", "date_value", "bool_value", "option_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "album_provenance" (
	"album_id" uuid,
	"field" text,
	"source" text NOT NULL,
	"source_ref" text,
	"retrieved_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_provenance_pkey" PRIMARY KEY("album_id","field"),
	CONSTRAINT "album_provenance_source_check" CHECK ("source" in ('user', 'musicbrainz', 'coverartarchive', 'itunes-lookup'))
);
--> statement-breakpoint
CREATE TABLE "album_service_links" (
	"album_id" uuid,
	"owner_id" uuid NOT NULL,
	"service" text,
	"url" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_service_links_pkey" PRIMARY KEY("album_id","service"),
	CONSTRAINT "album_service_links_service_check" CHECK ("service" in ('spotify', 'apple-music', 'qobuz'))
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"artist_credit" text NOT NULL,
	"release_type" text,
	"is_live" boolean,
	"original_year" integer,
	"recording_year_start" integer,
	"recording_year_end" integer,
	"edition_label" text,
	"artwork_url" text,
	"mb_release_id" uuid,
	"mb_release_group_id" uuid,
	"barcode" text,
	"trashed_at" timestamp(3) with time zone,
	"trash_unit_id" uuid,
	"search_title_key" text NOT NULL,
	"search_artist_key" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "albums_title_check" CHECK ("title" ~ '[^[:space:]]'),
	CONSTRAINT "albums_artist_credit_check" CHECK ("artist_credit" ~ '[^[:space:]]'),
	CONSTRAINT "albums_release_type_check" CHECK ("release_type" in ('album', 'ep', 'compilation')),
	CONSTRAINT "albums_year_check" CHECK ("original_year" is not null or ("is_live" is true and "recording_year_start" is not null)),
	CONSTRAINT "albums_recording_years_check" CHECK ("recording_year_end" >= "recording_year_start"),
	CONSTRAINT "albums_trash_check" CHECK (("trashed_at" is null) = ("trash_unit_id" is null))
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "change_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"op" text NOT NULL,
	"data" jsonb,
	"mutation_id" uuid,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_log_account_id_seq_unique" UNIQUE("account_id","seq")
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text,
	"trashed_at" timestamp(3) with time zone,
	"trash_unit_id" uuid,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "containers_kind_check" CHECK ("kind" in ('folder', 'list')),
	CONSTRAINT "containers_name_check" CHECK ("name" ~ '[^[:space:]]'),
	CONSTRAINT "containers_trash_check" CHECK (("trashed_at" is null) = ("trash_unit_id" is null))
);
--> statement-breakpoint
CREATE TABLE "field_definitions" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_definitions_name_check" CHECK ("name" ~ '[^[:space:]]'),
	CONSTRAINT "field_definitions_type_check" CHECK ("type" in ('text', 'number', 'date', 'yes_no', 'single_choice', 'multiple_choice'))
);
--> statement-breakpoint
CREATE TABLE "field_options" (
	"id" uuid PRIMARY KEY,
	"field_id" uuid NOT NULL,
	"label" text NOT NULL,
	"label_key" text NOT NULL,
	"sort_key" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_options_label_check" CHECK ("label" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"list_id" uuid,
	"album_id" uuid,
	"owner_id" uuid NOT NULL,
	"added_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_pkey" PRIMARY KEY("list_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "mutations" (
	"id" uuid PRIMARY KEY,
	"account_id" uuid NOT NULL,
	"principal" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"received_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"person_id" uuid,
	"view_key" text,
	"item_id" uuid,
	"key" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_pkey" PRIMARY KEY("person_id","view_key","item_id")
);
--> statement-breakpoint
CREATE TABLE "saved_references" (
	"viewer_id" uuid,
	"container_id" uuid,
	"link_id" uuid,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_references_pkey" PRIMARY KEY("viewer_id","container_id")
);
--> statement-breakpoint
CREATE TABLE "share_grants" (
	"id" uuid PRIMARY KEY,
	"container_id" uuid NOT NULL,
	"grantee_id" uuid NOT NULL,
	"status" text NOT NULL,
	"email_status" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_grants_status_check" CHECK ("status" in ('pending', 'accepted', 'declined', 'withdrawn', 'revoked')),
	CONSTRAINT "share_grants_email_status_check" CHECK ("email_status" in ('sending', 'sent', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY,
	"container_id" uuid NOT NULL,
	"token_hash" bytea NOT NULL UNIQUE,
	"revoked_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trash_units" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"root_id" uuid NOT NULL,
	"deleted_at" timestamp(3) with time zone NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"tombstones" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trash_units_kind_check" CHECK ("kind" in ('folder', 'list', 'album'))
);
--> statement-breakpoint
CREATE TABLE "view_prefs" (
	"person_id" uuid,
	"view_key" text,
	"sort_mode" text,
	"sort_dir" text,
	"grouped" boolean,
	"layout" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "view_prefs_pkey" PRIMARY KEY("person_id","view_key"),
	CONSTRAINT "view_prefs_sort_dir_check" CHECK ("sort_dir" in ('asc', 'desc')),
	CONSTRAINT "view_prefs_layout_check" CHECK ("layout" in ('rows', 'grid'))
);
--> statement-breakpoint
CREATE INDEX "album_field_multi_option_id_index" ON "album_field_multi" ("option_id");--> statement-breakpoint
CREATE INDEX "album_field_values_field_id_index" ON "album_field_values" ("field_id");--> statement-breakpoint
CREATE INDEX "album_field_values_option_id_index" ON "album_field_values" ("option_id");--> statement-breakpoint
CREATE INDEX "album_service_links_owner_id_service_entity_id_index" ON "album_service_links" ("owner_id","service","entity_id");--> statement-breakpoint
CREATE INDEX "albums_owner_id_index" ON "albums" ("owner_id");--> statement-breakpoint
CREATE INDEX "albums_trash_unit_id_index" ON "albums" ("trash_unit_id");--> statement-breakpoint
CREATE INDEX "change_log_created_at_index" ON "change_log" ("created_at");--> statement-breakpoint
CREATE INDEX "containers_owner_id_index" ON "containers" ("owner_id");--> statement-breakpoint
CREATE INDEX "containers_parent_id_index" ON "containers" ("parent_id");--> statement-breakpoint
CREATE INDEX "containers_trash_unit_id_index" ON "containers" ("trash_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "containers_active_sibling_name_key" ON "containers" ("owner_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),"name_key") WHERE "trashed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "field_definitions_owner_id_name_key_index" ON "field_definitions" ("owner_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "field_options_field_id_label_key_index" ON "field_options" ("field_id","label_key");--> statement-breakpoint
CREATE INDEX "memberships_album_id_index" ON "memberships" ("album_id");--> statement-breakpoint
CREATE INDEX "memberships_owner_id_index" ON "memberships" ("owner_id");--> statement-breakpoint
CREATE INDEX "mutations_account_id_index" ON "mutations" ("account_id");--> statement-breakpoint
CREATE INDEX "mutations_received_at_index" ON "mutations" ("received_at");--> statement-breakpoint
CREATE INDEX "saved_references_container_id_index" ON "saved_references" ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_grants_open_key" ON "share_grants" ("container_id","grantee_id") WHERE "status" in ('pending', 'accepted');--> statement-breakpoint
CREATE INDEX "share_grants_container_id_index" ON "share_grants" ("container_id");--> statement-breakpoint
CREATE INDEX "share_grants_grantee_id_index" ON "share_grants" ("grantee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_active_key" ON "share_links" ("container_id") WHERE "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "trash_units_owner_id_index" ON "trash_units" ("owner_id");--> statement-breakpoint
CREATE INDEX "trash_units_expires_at_index" ON "trash_units" ("expires_at");--> statement-breakpoint
ALTER TABLE "album_field_multi" ADD CONSTRAINT "album_field_multi_option_id_field_options_id_fkey" FOREIGN KEY ("option_id") REFERENCES "field_options"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "album_field_multi" ADD CONSTRAINT "album_field_multi_value_fkey" FOREIGN KEY ("album_id","field_id") REFERENCES "album_field_values"("album_id","field_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "album_field_values" ADD CONSTRAINT "album_field_values_album_id_albums_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "album_field_values" ADD CONSTRAINT "album_field_values_field_id_field_definitions_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "album_field_values" ADD CONSTRAINT "album_field_values_option_id_field_options_id_fkey" FOREIGN KEY ("option_id") REFERENCES "field_options"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "album_provenance" ADD CONSTRAINT "album_provenance_album_id_albums_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "album_service_links" ADD CONSTRAINT "album_service_links_album_id_albums_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_trash_unit_id_trash_units_id_fkey" FOREIGN KEY ("trash_unit_id") REFERENCES "trash_units"("id");--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_trash_unit_id_trash_units_id_fkey" FOREIGN KEY ("trash_unit_id") REFERENCES "trash_units"("id");--> statement-breakpoint
ALTER TABLE "field_options" ADD CONSTRAINT "field_options_field_id_field_definitions_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_list_id_containers_id_fkey" FOREIGN KEY ("list_id") REFERENCES "containers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_album_id_albums_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_references" ADD CONSTRAINT "saved_references_container_id_containers_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_references" ADD CONSTRAINT "saved_references_link_id_share_links_id_fkey" FOREIGN KEY ("link_id") REFERENCES "share_links"("id");--> statement-breakpoint
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_container_id_containers_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_container_id_containers_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE;