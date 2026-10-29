CREATE TYPE "public"."theme" AS ENUM('light', 'dark');--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "theme" "theme" DEFAULT 'dark' NOT NULL;