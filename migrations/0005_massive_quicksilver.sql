CREATE TYPE "public"."previously_set_status" AS ENUM('online', 'away', 'offline');--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "status" SET DEFAULT 'offline'::text;--> statement-breakpoint
DROP TYPE "public"."status";--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('online', 'offline');--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "status" SET DEFAULT 'offline'::"public"."status";--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "status" SET DATA TYPE "public"."status" USING "status"::"public"."status";--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "previously_set_status" "previously_set_status" DEFAULT 'online' NOT NULL;