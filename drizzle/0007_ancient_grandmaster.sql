CREATE INDEX "idx_archived_messages_session_id" ON "archived_messages" USING btree ("archived_session_id");--> statement-breakpoint
CREATE INDEX "idx_archived_parts_session_id" ON "archived_parts" USING btree ("archived_session_id");--> statement-breakpoint
CREATE INDEX "idx_archived_parts_message_id" ON "archived_parts" USING btree ("archived_message_id");--> statement-breakpoint
CREATE INDEX "idx_archived_sessions_chat_session_id" ON "archived_sessions" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "idx_archived_todos_session_id" ON "archived_todos" USING btree ("archived_session_id");