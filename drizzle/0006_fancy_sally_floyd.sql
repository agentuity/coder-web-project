CREATE TABLE IF NOT EXISTS "archived_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archived_session_id" uuid NOT NULL,
	"opencode_message_id" text NOT NULL,
	"role" text NOT NULL,
	"agent" text,
	"model" text,
	"cost" double precision,
	"tokens" jsonb,
	"error" text,
	"data" jsonb,
	"time_created" timestamp with time zone,
	"time_updated" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "archived_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archived_message_id" uuid NOT NULL,
	"archived_session_id" uuid NOT NULL,
	"opencode_part_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"time_created" timestamp with time zone,
	"time_updated" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "archived_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"opencode_session_id" text NOT NULL,
	"parent_session_id" text,
	"title" text,
	"project_id" text,
	"total_cost" double precision DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"reasoning_tokens" integer DEFAULT 0,
	"cache_read" integer DEFAULT 0,
	"cache_write" integer DEFAULT 0,
	"message_count" integer DEFAULT 0,
	"time_created" timestamp with time zone,
	"time_updated" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "archived_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archived_session_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='archive_status') THEN
    ALTER TABLE "chat_sessions" ADD COLUMN "archive_status" text DEFAULT 'none' NOT NULL;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'archived_messages_archived_session_id_archived_sessions_id_fk') THEN
    ALTER TABLE "archived_messages" ADD CONSTRAINT "archived_messages_archived_session_id_archived_sessions_id_fk" FOREIGN KEY ("archived_session_id") REFERENCES "public"."archived_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'archived_parts_archived_message_id_archived_messages_id_fk') THEN
    ALTER TABLE "archived_parts" ADD CONSTRAINT "archived_parts_archived_message_id_archived_messages_id_fk" FOREIGN KEY ("archived_message_id") REFERENCES "public"."archived_messages"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'archived_parts_archived_session_id_archived_sessions_id_fk') THEN
    ALTER TABLE "archived_parts" ADD CONSTRAINT "archived_parts_archived_session_id_archived_sessions_id_fk" FOREIGN KEY ("archived_session_id") REFERENCES "public"."archived_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'archived_sessions_chat_session_id_chat_sessions_id_fk') THEN
    ALTER TABLE "archived_sessions" ADD CONSTRAINT "archived_sessions_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'archived_todos_archived_session_id_archived_sessions_id_fk') THEN
    ALTER TABLE "archived_todos" ADD CONSTRAINT "archived_todos_archived_session_id_archived_sessions_id_fk" FOREIGN KEY ("archived_session_id") REFERENCES "public"."archived_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
