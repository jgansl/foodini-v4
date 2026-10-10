-- Owner foreign keys to Supabase Auth users; deleting a user deletes their data.
ALTER TABLE "items" ADD CONSTRAINT "items_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Data API access: signed-in users only, and only their own rows.
REVOKE ALL ON "items", "recipes", "recipe_ingredients" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "items", "recipes", "recipe_ingredients" TO authenticated;
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "items_owner" ON "items" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY "recipes_owner" ON "recipes" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY "recipe_ingredients_owner" ON "recipe_ingredients" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint

-- Private photo bucket; objects live under "<user_id>/…".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recipe-photos', 'recipe-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE POLICY "recipe_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
CREATE POLICY "recipe_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
CREATE POLICY "recipe_photos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
CREATE POLICY "recipe_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
