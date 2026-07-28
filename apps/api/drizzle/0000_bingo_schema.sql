CREATE SCHEMA IF NOT EXISTS "bingo";
--> statement-breakpoint
CREATE TYPE "bingo"."game_state" AS ENUM('lobby', 'live', 'done');--> statement-breakpoint
CREATE TYPE "bingo"."prize_kind" AS ENUM('LINE', 'TWO_LINES', 'FULL_HOUSE');--> statement-breakpoint
CREATE TYPE "bingo"."room_event_kind" AS ENUM('PLAYER_JOINED', 'GAME_STARTED', 'CALL', 'RETRACT', 'PRIZE');--> statement-breakpoint
CREATE TABLE "bingo"."cards" (
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"square_ids" text[] NOT NULL,
	CONSTRAINT "cards_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "bingo"."games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" varchar(4) NOT NULL,
	"theme_id" text NOT NULL,
	"deck" text[] NOT NULL,
	"seed" text NOT NULL,
	"state" "bingo"."game_state" DEFAULT 'lobby' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bingo"."players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" varchar(4) NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"join_seq" integer NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "bingo"."room_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"room_code" varchar(4) NOT NULL,
	"game_id" uuid,
	"actor_player_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "bingo"."room_event_kind" NOT NULL,
	"square_id" text,
	"target_seq" bigint,
	"prize_kind" "bingo"."prize_kind"
);
--> statement-breakpoint
CREATE TABLE "bingo"."rooms" (
	"code" varchar(4) PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"host_player_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bingo"."cards" ADD CONSTRAINT "cards_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "bingo"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo"."cards" ADD CONSTRAINT "cards_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "bingo"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo"."games" ADD CONSTRAINT "games_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "bingo"."rooms"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo"."players" ADD CONSTRAINT "players_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "bingo"."rooms"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo"."room_events" ADD CONSTRAINT "room_events_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "bingo"."rooms"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo"."room_events" ADD CONSTRAINT "room_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "bingo"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo"."room_events" ADD CONSTRAINT "room_events_actor_player_id_players_id_fk" FOREIGN KEY ("actor_player_id") REFERENCES "bingo"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo"."rooms" ADD CONSTRAINT "rooms_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "bingo"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_events_call_unique" ON "bingo"."room_events" USING btree ("game_id","square_id") WHERE kind = 'CALL';