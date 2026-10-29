-- Agents' writes by idempotency key (TS-22, TS-63, TON-82): each connection's keys, and the batch they stand for.
CREATE TABLE "mcp_operations" (
	"grant_id" uuid,
	"key" text,
	"batch_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"items" integer NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_operations_pkey" PRIMARY KEY("grant_id","key")
);
--> statement-breakpoint
CREATE INDEX "mcp_operations_created_at_index" ON "mcp_operations" ("created_at");--> statement-breakpoint
ALTER TABLE "mcp_operations" ADD CONSTRAINT "mcp_operations_grant_id_oauth_consent_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "oauth_consent"("id") ON DELETE CASCADE;