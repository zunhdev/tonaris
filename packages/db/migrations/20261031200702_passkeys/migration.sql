CREATE TABLE "passkey" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"credential_id" text NOT NULL UNIQUE,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "passkey_user_id_index" ON "passkey" ("user_id");--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;