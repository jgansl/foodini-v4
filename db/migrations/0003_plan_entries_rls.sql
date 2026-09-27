ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON "plan_entries" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "plan_entries" TO authenticated;
--> statement-breakpoint
ALTER TABLE "plan_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Rows are the owner's, and may only point at the owner's own recipes.
CREATE POLICY "plan_entries_owner" ON "plan_entries" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid()))
  WITH CHECK (
    "user_id" = (select auth.uid())
    AND EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_id" AND r."user_id" = (select auth.uid()))
  );
