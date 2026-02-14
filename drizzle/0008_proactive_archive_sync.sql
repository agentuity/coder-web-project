DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='last_archived_at') THEN
    ALTER TABLE "chat_sessions" ADD COLUMN "last_archived_at" TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;
