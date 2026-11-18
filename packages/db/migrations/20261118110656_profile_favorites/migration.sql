CREATE TABLE "profile_favorites" (
	"user_id" uuid,
	"album_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_favorites_pkey" PRIMARY KEY("user_id","album_id"),
	CONSTRAINT "profile_favorites_position_check" CHECK ("position" >= 0 and "position" < 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "profile_favorites_position_key" ON "profile_favorites" ("user_id","position");--> statement-breakpoint
CREATE INDEX "profile_favorites_album_id_index" ON "profile_favorites" ("album_id");--> statement-breakpoint
ALTER TABLE "profile_favorites" ADD CONSTRAINT "profile_favorites_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "profile_favorites" ADD CONSTRAINT "profile_favorites_album_id_albums_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE;