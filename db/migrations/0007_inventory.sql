CREATE TABLE "inventory" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_key" text NOT NULL,
	"quantity" numeric NOT NULL,
	"system" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_user_id_item_id_unit_key_pk" PRIMARY KEY("user_id","item_id","unit_key"),
	CONSTRAINT "inventory_quantity_nonnegative" CHECK ("inventory"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;