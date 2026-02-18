ALTER TABLE "user_settings" ALTER COLUMN "voice_name" SET DEFAULT 'coral';--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='forked_from_session_id') THEN
    ALTER TABLE "chat_sessions" ADD COLUMN "forked_from_session_id" uuid;
  END IF;
END $$;
