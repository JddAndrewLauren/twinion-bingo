ALTER TABLE "bingo"."rooms" ADD COLUMN "deck" text[];--> statement-breakpoint
UPDATE "bingo"."rooms" SET deck = (
  SELECT deck FROM "bingo"."games"
  WHERE games.room_code = rooms.code
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1
);--> statement-breakpoint
ALTER TABLE "bingo"."games" DROP COLUMN "deck";