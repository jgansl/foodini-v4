"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createRecipe, deleteRecipe, getRecipe, updateRecipe } from "@/db/queries/recipes";
import { FetchPageError, fetchPage } from "@/lib/fetch-page";
import { extractRecipe, extractTitle, type RecipeDraft } from "@/lib/import";
import { checkPhoto } from "@/lib/photo-rules";
import { readRecipeForm, validateRecipe, type FieldErrors, type RecipeFormValues } from "@/lib/recipe-input";
import { requireUser } from "@/server/auth";
import { removePhoto, uploadPhoto } from "@/server/photos";

export type RecipeFormState = { values: RecipeFormValues; fieldErrors: FieldErrors; message?: string } | null;

export async function saveRecipe(recipeId: string | null, _prev: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const user = await requireUser();
  const values = readRecipeForm(formData);
  const parsed = validateRecipe(values);
  const photoEntry = formData.get("photo");
  const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  const photoCheck = checkPhoto(photo);

  if (!parsed.ok || !photoCheck.ok) {
    return {
      values,
      fieldErrors: { ...(parsed.ok ? {} : parsed.fieldErrors), ...(photoCheck.ok ? {} : { photo: photoCheck.message }) },
    };
  }

  // Ownership check happens before any upload; notFound() must stay outside the try below.
  const existing = recipeId ? await getRecipe(user.id, recipeId) : null;
  if (recipeId && !existing) notFound();
  const id = recipeId ?? crypto.randomUUID();
  const removeCurrent = formData.get("removePhoto") === "on";

  try {
    const uploaded = photo ? await uploadPhoto(user.id, id, photo) : null;
    const imagePath = uploaded ?? (removeCurrent ? null : (existing?.imagePath ?? null));
    if (existing) await updateRecipe(user.id, id, parsed.data, imagePath);
    else await createRecipe(user.id, parsed.data, { id, imagePath });
    if (existing?.imagePath && existing.imagePath !== imagePath) await removePhoto(existing.imagePath);
  } catch (error) {
    console.error("saveRecipe failed", error);
    return { values, fieldErrors: {}, message: "Couldn't save the recipe. Please try again." };
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${id}`);
}

export async function deleteRecipeAction(recipeId: string): Promise<void> {
  const user = await requireUser();
  const deleted = await deleteRecipe(user.id, recipeId);
  if (deleted?.status === "deleted" && deleted.imagePath) await removePhoto(deleted.imagePath);
  revalidatePath("/recipes");
  redirect("/recipes");
}

export async function importRecipe(
  url: string,
): Promise<{ ok: true; draft: RecipeDraft } | { ok: false; message: string; draft?: RecipeDraft }> {
  await requireUser();
  if (typeof url !== "string" || !url.trim()) return { ok: false, message: "Paste a recipe link first." };

  const allowPrivate = process.env.NODE_ENV !== "production" && process.env.IMPORT_ALLOW_PRIVATE === "1";
  try {
    const page = await fetchPage(url.trim(), { allowPrivate });
    const draft = extractRecipe(page.html, page.url);
    if (draft) return { ok: true, draft };
    return {
      ok: false,
      message: "Couldn't find a recipe on that page. You can enter it by hand below.",
      draft: { title: extractTitle(page.html) ?? "", servings: null, ingredients: [], steps: [], tags: [], sourceUrl: page.url },
    };
  } catch (error) {
    if (error instanceof FetchPageError) return { ok: false, message: error.message };
    console.error("importRecipe failed", error);
    return { ok: false, message: "Something went wrong fetching that page." };
  }
}
