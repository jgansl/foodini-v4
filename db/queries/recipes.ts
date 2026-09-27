import "server-only";
import { and, arrayContains, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { planEntries, recipeIngredients, recipes } from "@/db/schema";
import { normalizeItemName, parseIngredient } from "@/lib/ingredients";
import type { RecipeInput } from "@/lib/recipe-input";
import { resolveItems } from "./items";

export type RecipeSummary = { id: string; title: string; servings: number; tags: string[]; imagePath: string | null };
export type RecipeIngredientRow = {
  id: string;
  position: number;
  rawText: string;
  itemId: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};
export type RecipeDetail = RecipeSummary & {
  steps: string[];
  sourceUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  ingredients: RecipeIngredientRow[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summaryColumns = {
  id: recipes.id,
  title: recipes.title,
  servings: recipes.servings,
  tags: recipes.tags,
  imagePath: recipes.imagePath,
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function recipeColumns(input: RecipeInput) {
  return {
    title: input.title,
    servings: input.servings,
    steps: input.steps,
    tags: input.tags,
    sourceUrl: input.sourceUrl,
    notes: input.notes,
  };
}

export async function insertIngredients(tx: DbOrTx, userId: string, recipeId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const parsed = lines.map(parseIngredient);
  const itemIds = await resolveItems(
    tx,
    userId,
    parsed.flatMap((p) => (p.name ? [{ name: p.name, unit: p.unit }] : [])),
  );
  await tx.insert(recipeIngredients).values(
    parsed.map((p, position) => ({
      userId,
      recipeId,
      position,
      rawText: p.raw,
      itemId: p.name ? (itemIds.get(normalizeItemName(p.name)) ?? null) : null,
      quantity: p.quantity,
      unit: p.unit,
      note: p.note,
    })),
  );
}

export async function listRecipes(userId: string, filter: { q?: string; tag?: string } = {}): Promise<RecipeSummary[]> {
  const conditions = [eq(recipes.userId, userId)];
  if (filter.q) conditions.push(ilike(recipes.title, `%${escapeLike(filter.q)}%`));
  if (filter.tag) conditions.push(arrayContains(recipes.tags, [filter.tag]));
  return db
    .select(summaryColumns)
    .from(recipes)
    .where(and(...conditions))
    .orderBy(desc(recipes.updatedAt), asc(recipes.title));
}

export async function listTags(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tag: sql<string>`unnest(${recipes.tags})` })
    .from(recipes)
    .where(eq(recipes.userId, userId));
  return rows.map((r) => r.tag).sort();
}

export async function getRecipe(userId: string, id: string): Promise<RecipeDetail | null> {
  if (!UUID.test(id)) return null;
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
  if (!recipe) return null;
  const ingredients = await db
    .select({
      id: recipeIngredients.id,
      position: recipeIngredients.position,
      rawText: recipeIngredients.rawText,
      itemId: recipeIngredients.itemId,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      note: recipeIngredients.note,
    })
    .from(recipeIngredients)
    .where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.userId, userId)))
    .orderBy(asc(recipeIngredients.position));
  return {
    id: recipe.id,
    title: recipe.title,
    servings: recipe.servings,
    tags: recipe.tags,
    imagePath: recipe.imagePath,
    steps: recipe.steps,
    sourceUrl: recipe.sourceUrl,
    notes: recipe.notes,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    ingredients,
  };
}

export async function createRecipe(
  userId: string,
  input: RecipeInput,
  opts: { id?: string; imagePath?: string | null } = {},
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recipes)
      .values({ ...recipeColumns(input), userId, imagePath: opts.imagePath ?? null, ...(opts.id ? { id: opts.id } : {}) })
      .returning({ id: recipes.id });
    await insertIngredients(tx, userId, row.id, input.ingredients);
    return row.id;
  });
}

export async function updateRecipe(userId: string, id: string, input: RecipeInput, imagePath: string | null): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(recipes)
      .set({ ...recipeColumns(input), imagePath, updatedAt: new Date() })
      .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
      .returning({ id: recipes.id });
    if (updated.length === 0) return false;
    await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    await insertIngredients(tx, userId, id, input.ingredients);
    return true;
  });
}

export type DeleteRecipeResult = { status: "deleted"; imagePath: string | null } | { status: "planned"; count: number };

/**
 * Deletes the user's recipe. If it is still planned, returns `{ status: "planned" }` instead,
 * unless `removePlanEntries` is set, in which case its plan entries are deleted too.
 */
export async function deleteRecipe(
  userId: string,
  id: string,
  opts: { removePlanEntries?: boolean } = {},
): Promise<DeleteRecipeResult | null> {
  if (!UUID.test(id)) return null;
  return db.transaction(async (tx) => {
    const ownedRecipe = and(eq(recipes.id, id), eq(recipes.userId, userId));
    const [recipe] = await tx.select({ id: recipes.id }).from(recipes).where(ownedRecipe);
    if (!recipe) return null;
    const plannedFor = and(eq(planEntries.recipeId, id), eq(planEntries.userId, userId));
    const [{ n }] = await tx.select({ n: count() }).from(planEntries).where(plannedFor);
    if (n > 0) {
      if (!opts.removePlanEntries) return { status: "planned", count: n };
      await tx.delete(planEntries).where(plannedFor);
    }
    const [row] = await tx.delete(recipes).where(ownedRecipe).returning({ imagePath: recipes.imagePath });
    return row ? { status: "deleted", imagePath: row.imagePath } : null;
  });
}
