ALTER TABLE "user_settings" ALTER COLUMN "voice_name" SET DEFAULT 'coral';--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "forked_from_session_id" uuid;