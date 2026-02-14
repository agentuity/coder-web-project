DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='default_command') THEN
    ALTER TABLE "user_settings" ADD COLUMN "default_command" text DEFAULT '';
  END IF;
END $$;
