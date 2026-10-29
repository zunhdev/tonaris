-- Creator-assisted recovery of a sign-in email (TS-73, TON-78), and its audit action.
CREATE TABLE "email_recoveries" (
	"user_id" uuid PRIMARY KEY,
	"new_email_key" text NOT NULL,
	"token_hash" bytea NOT NULL UNIQUE,
	"code_hash" bytea NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"reason" text NOT NULL,
	"disconnect_connections" boolean NOT NULL,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_recoveries_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_recoveries" ADD CONSTRAINT "email_recoveries_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check", ADD CONSTRAINT "audit_log_action_check" CHECK ("action" in ('email.change', 'email.recover'));