-- The address the owner typed for each invitation (DS-65, TON-65). Grants made before it, such as the workload's,
-- take the grantee's sign-in email, which is what an owner would have typed.
ALTER TABLE "share_grants" ADD COLUMN "invited_email" text;--> statement-breakpoint
UPDATE "share_grants" SET "invited_email" = "user"."email" FROM "user" WHERE "user"."id" = "share_grants"."grantee_id";--> statement-breakpoint
ALTER TABLE "share_grants" ALTER COLUMN "invited_email" SET NOT NULL;
