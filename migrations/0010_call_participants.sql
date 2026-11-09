CREATE TYPE "public"."call_type" AS ENUM('audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."call_participant_role" AS ENUM('initiator', 'participant');--> statement-breakpoint
CREATE TYPE "public"."call_participant_status" AS ENUM('outgoing', 'invited', 'accepted', 'declined', 'missed', 'joined', 'left');--> statement-breakpoint
CREATE TABLE "call" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text,
	"group_id" text,
	"initiator_id" text NOT NULL,
	"call_type" "call_type" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "call_exactly_one_parent" CHECK (("call"."conversation_id" IS NOT NULL AND "call"."group_id" IS NULL)
				OR ("call"."conversation_id" IS NULL AND "call"."group_id" IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_initiator_id_user_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_conversation_id_idx" ON "call" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_active_group_unique" ON "call" USING btree ("group_id") WHERE ("group_id" IS NOT NULL AND "ended_at" IS NULL);--> statement-breakpoint
CREATE INDEX "call_group_id_idx" ON "call" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "call_initiator_id_idx" ON "call" USING btree ("initiator_id");--> statement-breakpoint
CREATE TABLE "call_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"image_url" text,
	"role" "call_participant_role" NOT NULL,
	"status" "call_participant_status" NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	CONSTRAINT "call_participant_user_unique" UNIQUE("call_id", "user_id")
);--> statement-breakpoint
ALTER TABLE "call_participant" ADD CONSTRAINT "call_participant_call_id_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participant" ADD CONSTRAINT "call_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_participant_call_id_idx" ON "call_participant" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "call_participant_user_id_idx" ON "call_participant" USING btree ("user_id");
