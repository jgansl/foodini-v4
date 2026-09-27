ALTER TABLE "grocery_marks" ADD CONSTRAINT "grocery_marks_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "grocery_extras" ADD CONSTRAINT "grocery_extras_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON "grocery_marks", "grocery_extras" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "grocery_marks", "grocery_extras" TO authenticated;
--> statement-breakpoint
ALTER TABLE "grocery_marks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "grocery_extras" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "grocery_marks_owner" ON "grocery_marks" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint
-- Extras are the owner's, and may only link the owner's own items.
CREATE POLICY "grocery_extras_owner" ON "grocery_extras" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid()))
  WITH CHECK (
    "user_id" = (select auth.uid())
    AND ("item_id" IS NULL OR EXISTS (SELECT 1 FROM "items" i WHERE i."id" = "item_id" AND i."user_id" = (select auth.uid())))
  );
