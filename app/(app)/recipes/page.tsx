import Link from "next/link";
import { ui } from "@/components/ui";
import { listRecipes, listTags } from "@/db/queries/recipes";
import { TagFilter } from "./tag-filter";
import { requireUser } from "@/server/auth";
import { photoUrls } from "@/server/photos";

export default async function RecipesPage(props: PageProps<"/recipes">) {
  const user = await requireUser("/recipes");
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  // `?tag=a&tag=b`: one value arrives as a string, several as an array.
  const picked = [params.tag ?? []].flat().filter((t): t is string => typeof t === "string" && t !== "");

  const [recipes, tags] = await Promise.all([listRecipes(user.id, { q, tags: picked }), listTags(user.id)]);
  const photos = await photoUrls(recipes.flatMap((r) => (r.imagePath ? [r.imagePath] : [])));
  const filtering = Boolean(q || picked.length > 0);

  return (
    <main className={ui.page}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className={ui.h1}>Recipes</h1>
        <Link href="/recipes/new" className={ui.button}>
          New recipe
        </Link>
      </div>

      <form role="search" action="/recipes" className="mb-5 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search recipes
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Search by title" className={`${ui.input} mt-0 min-w-0`} />
        {tags.length > 0 && <TagFilter key={picked.join("\n")} tags={tags} selected={picked} />}
        <button type="submit" className={ui.buttonSecondary}>
          Search
        </button>
      </form>

      {recipes.length === 0 ? (
        <div className={`${ui.card} text-center`}>
          {filtering ? (
            <p>
              No recipes match.{" "}
              <Link href="/recipes" className="text-emerald-700 underline dark:text-emerald-400">
                Clear filters
              </Link>
            </p>
          ) : (
            <p>
              No recipes yet.{" "}
              <Link href="/recipes/new" className="text-emerald-700 underline dark:text-emerald-400">
                Add your first one
              </Link>{" "}
              or import one from a link.
            </p>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {recipes.map((r) => {
            const photo = r.imagePath ? photos.get(r.imagePath) : undefined;
            return (
              <li key={r.id} className="min-w-0">
                <Link href={`/recipes/${r.id}`} className={`${ui.card} flex gap-3 hover:border-emerald-600`}>
                  {photo ? (
                    // Signed Supabase URLs; next/image would need per-environment remotePatterns.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div aria-hidden className="size-16 shrink-0 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="text-sm text-neutral-500">
                      {r.servings} serving{r.servings === 1 ? "" : "s"}
                    </p>
                    {r.tags.length > 0 && <p className="truncate text-sm text-neutral-500">{r.tags.join(" · ")}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
