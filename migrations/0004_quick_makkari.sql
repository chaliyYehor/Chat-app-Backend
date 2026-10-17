ALTER TABLE "user_profile" RENAME COLUMN "profile_picture" TO "image_url";--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "image_pub_id" text;