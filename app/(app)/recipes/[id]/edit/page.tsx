import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import { getRecipe } from "@/db/queries/recipes";
import { recipeToFormValues } from "@/lib/recipe-input";
import { requireUser } from "@/server/auth";
import { saveRecipe } from "../../actions";
import { RecipeEditor } from "../../recipe-editor";

export default async function EditRecipePage(props: PageProps<"/recipes/[id]/edit">) {
  const { id } = await props.params;
  const user = await requireUser(`/recipes/${id}/edit`);
  const recipe = await getRecipe(user.id, id);
  if (!recipe) notFound();

  return (
    <main className={ui.page}>
      <h1 className={`${ui.h1} mb-6`}>Edit recipe</h1>
      <RecipeEditor action={saveRecipe.bind(null, recipe.id)} initial={recipeToFormValues(recipe)} hasPhoto={recipe.imagePath !== null} submitLabel="Save changes" />
    </main>
  );
}
