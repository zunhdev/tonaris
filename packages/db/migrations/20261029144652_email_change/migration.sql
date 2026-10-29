-- The sign-in email change (TS-73, TON-77), and the audit log (TS-11) it is the first to write.
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY,
	"actor" uuid,
	"action" text NOT NULL,
	"subject" uuid NOT NULL,
	"details" jsonb NOT NULL,
	"at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_check" CHECK ("action" in ('email.change'))
);
--> statement-breakpoint
CREATE TABLE "email_changes" (
	"user_id" uuid PRIMARY KEY,
	"new_email_key" text NOT NULL,
	"stage" text NOT NULL,
	"code_hash" bytea NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_changes_stage_check" CHECK ("stage" in ('current', 'new')),
	CONSTRAINT "email_changes_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" ("subject","at");--> statement-breakpoint
ALTER TABLE "email_changes" ADD CONSTRAINT "email_changes_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;