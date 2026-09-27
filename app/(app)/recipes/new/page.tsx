import { ui } from "@/components/ui";
import { EMPTY_RECIPE_FORM } from "@/lib/recipe-input";
import { requireUser } from "@/server/auth";
import { saveRecipe } from "../actions";
import { RecipeEditor } from "../recipe-editor";

export default async function NewRecipePage() {
  await requireUser("/recipes/new");
  return (
    <main className={ui.page}>
      <h1 className={`${ui.h1} mb-6`}>New recipe</h1>
      <RecipeEditor action={saveRecipe.bind(null, null)} initial={EMPTY_RECIPE_FORM} showImport submitLabel="Save recipe" />
    </main>
  );
}
