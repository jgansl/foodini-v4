import Link from "next/link";
import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import { getRecipe } from "@/db/queries/recipes";
import { requireUser } from "@/server/auth";
import { photoUrls } from "@/server/photos";
import { deleteRecipeAction } from "../actions";
import { DeleteRecipeButton } from "./delete-button";
import { ServingsScaler } from "./servings-scaler";

export default async function RecipePage(props: PageProps<"/recipes/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/recipes/${id}`);
  const recipe = await getRecipe(user.id, id);
  if (!recipe) notFound();

  const photo = recipe.imagePath ? (await photoUrls([recipe.imagePath])).get(recipe.imagePath) : undefined;
  const sourceHost = recipe.sourceUrl ? new URL(recipe.sourceUrl).hostname : null;

  return (
    <main className={ui.page}>
      <Link href="/recipes" className="text-sm text-neutral-500 hover:underline">
        ← Recipes
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className={ui.h1}>{recipe.title}</h1>
        <div className="flex gap-2">
          <Link href={`/recipes/${recipe.id}/edit`} className={ui.buttonSecondary}>
            Edit
          </Link>
          <DeleteRecipeButton action={deleteRecipeAction.bind(null, recipe.id)} title={recipe.title} />
        </div>
      </div>

      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={recipe.title} className="mb-6 max-h-80 w-full rounded-xl object-cover" />
      )}

      {recipe.tags.length > 0 && (
        <ul aria-label="Tags" className="mb-6 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <li key={t}>
              <Link href={`/recipes?tag=${encodeURIComponent(t)}`} className={ui.chip}>
                {t}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-8 md:grid-cols-[2fr_3fr]">
        <ServingsScaler baseServings={recipe.servings} ingredients={recipe.ingredients.map((i) => i.rawText)} />
        {recipe.steps.length > 0 && (
          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className="mb-3 text-lg font-semibold">
              Steps
            </h2>
            <ol className="list-decimal space-y-3 pl-5">
              {recipe.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {recipe.notes && (
        <section aria-labelledby="notes-heading" className="mt-8">
          <h2 id="notes-heading" className="mb-2 text-lg font-semibold">
            Notes
          </h2>
          <p className="whitespace-pre-line">{recipe.notes}</p>
        </section>
      )}

      {recipe.sourceUrl && (
        <p className="mt-8 text-sm">
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline dark:text-emerald-400">
            View original ({sourceHost})
          </a>
        </p>
      )}
    </main>
  );
}
