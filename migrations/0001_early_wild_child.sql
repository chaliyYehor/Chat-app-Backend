ALTER TABLE "user_profile" RENAME COLUMN "username" TO "user_pub_id";--> statement-breakpoint
ALTER TABLE "user_profile" DROP CONSTRAINT "user_profile_username_unique";--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_pub_id_unique" UNIQUE("user_pub_id");