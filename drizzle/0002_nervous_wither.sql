DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='voice_enabled') THEN
    ALTER TABLE "user_settings" ADD COLUMN "voice_enabled" boolean DEFAULT false;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='voice_model') THEN
    ALTER TABLE "user_settings" ADD COLUMN "voice_model" text DEFAULT 'gpt-4o-mini-tts';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='voice_name') THEN
    ALTER TABLE "user_settings" ADD COLUMN "voice_name" text DEFAULT 'alloy';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='voice_auto_speak') THEN
    ALTER TABLE "user_settings" ADD COLUMN "voice_auto_speak" boolean DEFAULT true;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='voice_speed') THEN
    ALTER TABLE "user_settings" ADD COLUMN "voice_speed" text DEFAULT '1.0';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='preferred_mic') THEN
    ALTER TABLE "user_settings" ADD COLUMN "preferred_mic" text;
  END IF;
END $$;
