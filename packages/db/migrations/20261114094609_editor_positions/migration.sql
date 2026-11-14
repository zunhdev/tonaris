CREATE TABLE "spent_unit_ids" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_sync" ADD COLUMN "writes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spent_unit_ids" ADD CONSTRAINT "spent_unit_ids_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");