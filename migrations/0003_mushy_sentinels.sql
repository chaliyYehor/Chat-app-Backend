CREATE TABLE "user_preferences" (
	"user_id" text NOT NULL,
	"typing_sounds" boolean DEFAULT true,
	"message_sounds" boolean DEFAULT true,
	"read_receipts" boolean DEFAULT true,
	"last_seen" boolean DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;