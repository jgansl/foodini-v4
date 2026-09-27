CREATE TABLE "grocery_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"item_id" uuid,
	"name" text NOT NULL,
	"quantity" numeric,
	"unit" text,
	"checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_marks" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"key" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_qty" numeric,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grocery_marks_user_id_week_start_key_pk" PRIMARY KEY("user_id","week_start","key")
);
--> statement-breakpoint
ALTER TABLE "grocery_extras" ADD CONSTRAINT "grocery_extras_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grocery_extras_user_week_idx" ON "grocery_extras" USING btree ("user_id","week_start");