-- The job queue (TS-90), first for email (TS-72, TON-73).
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp(3) with time zone,
	"last_error" text,
	"dead_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" ("run_at") WHERE "dead_at" is null;