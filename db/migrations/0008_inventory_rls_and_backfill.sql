ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON "inventory" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory" TO authenticated;
--> statement-breakpoint
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Rows are the owner's, and may only point at the owner's own items.
CREATE POLICY "inventory_owner" ON "inventory" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid()))
  WITH CHECK (
    "user_id" = (select auth.uid())
    AND EXISTS (SELECT 1 FROM "items" i WHERE i."id" = "item_id" AND i."user_id" = (select auth.uid()))
  );
--> statement-breakpoint
-- Backfill (D27): until phase 4 a checked amount meant "bought this week" (D18). Carry checked item lines
-- of the current and future weeks into inventory; older weeks are treated as used up. Keys look like
-- item:<36-char uuid>:<unitKey>, so the unit key starts at character 43.
INSERT INTO "inventory" ("user_id", "item_id", "unit_key", "quantity")
SELECT m."user_id", i."id", substring(m."key" from 43), sum(m."checked_qty")
FROM "grocery_marks" m
JOIN "items" i ON i."user_id" = m."user_id" AND i."id"::text = substring(m."key" from 6 for 36)
WHERE m."checked" AND m."checked_qty" IS NOT NULL AND m."key" LIKE 'item:%'
  AND m."week_start" >= date_trunc('week', now())::date
GROUP BY m."user_id", i."id", substring(m."key" from 43)
ON CONFLICT ("user_id", "item_id", "unit_key") DO UPDATE SET "quantity" = "inventory"."quantity" + excluded."quantity";
