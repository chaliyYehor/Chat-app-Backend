CREATE TYPE "public"."role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "group" (
	"id" text PRIMARY KEY NOT NULL,
	"member_ids" text[] DEFAULT '{}' NOT NULL,
	"group_name" text NOT NULL,
	"group_description" text,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_has_members" CHECK (cardinality("group"."member_ids") >= 1)
);
--> statement-breakpoint
CREATE TABLE "group_user" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "role" DEFAULT 'member' NOT NULL,
	"last_read_message_id" text,
	"unread_messages_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_user_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "group_user" ADD CONSTRAINT "group_user_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_user" ADD CONSTRAINT "group_user_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_member_ids_idx" ON "group" USING gin ("member_ids");--> statement-breakpoint
CREATE INDEX "group_last_message_at_idx" ON "group" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "group_user_user_id_idx" ON "group_user" USING btree ("user_id");