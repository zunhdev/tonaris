CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY,
	"account_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"args" jsonb NOT NULL,
	"scope" jsonb NOT NULL,
	"scope_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"decided_at" timestamp(3) with time zone,
	"used_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_operation_check" CHECK ("operation" in ('delete_albums')),
	CONSTRAINT "approvals_status_check" CHECK ("status" in ('pending', 'approved', 'declined', 'used'))
);
--> statement-breakpoint
CREATE INDEX "approvals_account_id_index" ON "approvals" ("account_id");--> statement-breakpoint
CREATE INDEX "approvals_grant_id_index" ON "approvals" ("grant_id");--> statement-breakpoint
CREATE INDEX "approvals_expires_at_index" ON "approvals" ("expires_at");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_grant_id_oauth_consent_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "oauth_consent"("id") ON DELETE CASCADE;