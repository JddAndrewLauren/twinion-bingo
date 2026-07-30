DROP INDEX "bingo"."room_events_call_unique";--> statement-breakpoint
CREATE INDEX "room_events_call_idx" ON "bingo"."room_events" USING btree ("game_id","square_id") WHERE kind = 'CALL';--> statement-breakpoint
CREATE INDEX "room_events_target_seq_idx" ON "bingo"."room_events" USING btree ("target_seq") WHERE kind = 'RETRACT';