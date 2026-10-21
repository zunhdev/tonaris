CREATE TABLE "admission_invitations" (
	"id" uuid PRIMARY KEY,
	"email_key" text NOT NULL,
	"token_hash" bytea NOT NULL UNIQUE,
	"status" text DEFAULT 'available' NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp(3) with time zone,
	"email_status" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_invitations_status_check" CHECK ("status" in ('available', 'redeemed', 'revoked', 'expired')),
	CONSTRAINT "admission_invitations_email_status_check" CHECK ("email_status" in ('sending', 'sent', 'failed', 'unknown')),
	CONSTRAINT "admission_invitations_redeemed_check" CHECK (("status" = 'redeemed') = ("redeemed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "service_state" (
	"id" smallint PRIMARY KEY DEFAULT 1,
	"admissions_paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_state_singleton_check" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admission_invitations_available_email_key" ON "admission_invitations" ("email_key") WHERE "status" = 'available';--> statement-breakpoint
ALTER TABLE "admission_invitations" ADD CONSTRAINT "admission_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "admission_invitations" ADD CONSTRAINT "admission_invitations_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
-- The single service-state row, written by hand: drizzle-kit generates no data. Admissions start open.
INSERT INTO "service_state" ("id") VALUES (1);
