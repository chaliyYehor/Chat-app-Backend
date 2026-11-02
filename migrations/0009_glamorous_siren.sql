ALTER TABLE "message" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_exactly_one_parent" CHECK (("message"."conversation_id" IS NOT NULL AND "message"."group_id" IS NULL)
				OR ("message"."conversation_id" IS NULL AND "message"."group_id" IS NOT NULL));