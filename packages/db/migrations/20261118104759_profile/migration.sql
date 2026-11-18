ALTER TABLE "user" ADD COLUMN "avatar_hue" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_avatar_hue_check" CHECK ("avatar_hue" is null or ("avatar_hue" between 0 and 330 and "avatar_hue" % 30 = 0));