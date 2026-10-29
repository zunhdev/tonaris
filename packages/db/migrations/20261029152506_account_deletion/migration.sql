-- Account deletion (TS-74, TON-79): the progress its browser follows, and the account marked while it runs.
CREATE TABLE "account_deletions" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"token_hash" bytea NOT NULL UNIQUE,
	"status" text NOT NULL,
	"finished_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletions_status_check" CHECK ("status" in ('deleting', 'deleted', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleting_at" timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check", ADD CONSTRAINT "audit_log_action_check" CHECK ("action" in ('email.change', 'email.recover', 'account.delete'));