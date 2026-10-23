CREATE TABLE "provider_cache" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "provider_cache_expires_at_index" ON "provider_cache" ("expires_at");