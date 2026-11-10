-- What each invitation lets its person do (FR-07.18, TON-188). Invitations made before roles view, as they did.
ALTER TABLE "share_grants" ADD COLUMN "role" text DEFAULT 'view' NOT NULL;--> statement-breakpoint
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_role_check" CHECK ("role" in ('view', 'edit'));