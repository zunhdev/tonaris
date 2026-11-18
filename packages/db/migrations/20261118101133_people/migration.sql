-- People come from invitations (FR-07.23, TON-294). When a grant was accepted, kept after leaving or a revocation;
-- accepted and withdrawn grants take their last change, and grants revoked before this can't tell. An invitation of
-- one of the owner's people by account may have no address they typed.
ALTER TABLE "share_grants" ADD COLUMN "accepted_at" timestamp(3) with time zone;--> statement-breakpoint
UPDATE "share_grants" SET "accepted_at" = "updated_at" WHERE "status" IN ('accepted', 'withdrawn');--> statement-breakpoint
ALTER TABLE "share_grants" ALTER COLUMN "invited_email" DROP NOT NULL;
