-- When an MCP connection was last used (DS-86, TON-80): Tonaris's own column on Better Auth's consent.
ALTER TABLE "oauth_consent" ADD COLUMN "last_used_at" timestamp(3) with time zone;