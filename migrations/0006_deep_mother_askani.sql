CREATE TYPE "public"."message_type" AS ENUM('text_or_image', 'image');--> statement-breakpoint
CREATE TABLE "message" (
	"conversation_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"type" "message_type" DEFAULT 'text_or_image' NOT NULL,
	"text" text,
	"image_url" text,
	"image_pub_id" text
);
--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;