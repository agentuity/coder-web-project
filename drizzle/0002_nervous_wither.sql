ALTER TABLE "user_settings" ADD COLUMN "voice_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "voice_model" text DEFAULT 'gpt-4o-mini-tts';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "voice_name" text DEFAULT 'alloy';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "voice_auto_speak" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "voice_speed" text DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "preferred_mic" text;