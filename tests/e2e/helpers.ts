import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Creates a throwaway user and signs the page in through the real /auth/confirm route. */
export async function signInAsNewUser(page: Page, domain = "example.test"): Promise<{ id: string }> {
  const email = `e2e-${crypto.randomUUID()}@${domain}`;
  const { data: created, error: createError } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (createError) throw createError;
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=/recipes`);
  if (domain === "example.test") await page.waitForURL("**/recipes");
  return { id: created.user.id };
}

export async function deleteUser(id: string): Promise<void> {
  await admin().auth.admin.deleteUser(id);
}

export async function createRecipeViaUi(page: Page, title: string, servings: number, ingredients: string): Promise<string> {
  await page.goto("/recipes/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Servings", { exact: true }).fill(String(servings));
  await page.getByLabel("Ingredients", { exact: true }).fill(ingredients);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await page.getByRole("heading", { level: 1, name: title }).waitFor();
  return page.url();
}
