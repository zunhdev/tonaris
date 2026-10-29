CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY,
	"finished_at" timestamp(3) with time zone NOT NULL,
	"object_key" text NOT NULL,
	"bytes" bigint NOT NULL
);
