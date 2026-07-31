ALTER TYPE "bingo"."room_event_kind" ADD VALUE 'CARD_REROLLED';--> statement-breakpoint
ALTER TABLE "bingo"."cards" ADD COLUMN "latest_reroll_seq" bigint;