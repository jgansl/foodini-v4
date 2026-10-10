ALTER TABLE "grocery_extras" ADD COLUMN "in_inventory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "grocery_marks" ADD COLUMN "in_inventory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Marks the backfill in 0008 moved into inventory (same condition). Older marks and all extras never were,
-- so unchecking them must not take anything out.
UPDATE "grocery_marks" SET "in_inventory" = true
WHERE "checked" AND "checked_qty" > 0 AND "key" LIKE 'item:%' AND "week_start" >= date_trunc('week', now())::date;
