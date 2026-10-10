CREATE TYPE "public"."unit_kind" AS ENUM('count', 'volume', 'weight');--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"section" text NOT NULL,
	"unit_kind" "unit_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"raw_text" text NOT NULL,
	"item_id" uuid,
	"quantity" numeric,
	"unit" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"servings" integer NOT NULL,
	"steps" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_url" text,
	"image_path" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_servings_positive" CHECK ("recipes"."servings" > 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_user_key_idx" ON "items" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_idx" ON "recipe_ingredients" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipes_user_updated_idx" ON "recipes" USING btree ("user_id","updated_at");