CREATE TABLE "account" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp(3) with time zone,
	"refresh_token_expires_at" timestamp(3) with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_check" CHECK ("role" in ('creator', 'user'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_creator_key" ON "user" ("role") WHERE "role" = 'creator';--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "account_sync" ADD CONSTRAINT "account_sync_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "album_service_links" ADD CONSTRAINT "album_service_links_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_person_id_user_id_fkey" FOREIGN KEY ("person_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "saved_references" ADD CONSTRAINT "saved_references_viewer_id_user_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_grantee_id_user_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "trash_units" ADD CONSTRAINT "trash_units_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "view_prefs" ADD CONSTRAINT "view_prefs_person_id_user_id_fkey" FOREIGN KEY ("person_id") REFERENCES "user"("id");