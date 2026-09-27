CREATE TABLE "plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"position" integer NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" numeric NOT NULL,
	"label" text,
	"cooked_at" timestamp with time zone,
	"deducted" jsonb,
	CONSTRAINT "plan_entries_servings_positive" CHECK ("plan_entries"."servings" > 0)
);
--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_entries_user_date_idx" ON "plan_entries" USING btree ("user_id","date","position");--> statement-breakpoint
CREATE INDEX "plan_entries_recipe_idx" ON "plan_entries" USING btree ("recipe_id");