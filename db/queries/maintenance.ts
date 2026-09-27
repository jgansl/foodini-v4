import "server-only";
import { and, asc, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { groceryExtras, items, recipeIngredients, recipes } from "@/db/schema";
import { insertIngredients } from "./recipes";

/**
 * Re-parses every stored ingredient line of the user's recipes with the current parser and
 * re-links them to items, then deletes items nothing refers to any more.
 */
export async function reparseIngredients(userId: string): Promise<{ recipes: number; itemsRemoved: number }> {
  const recipeRows = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.userId, userId));
  for (const { id } of recipeRows) {
    await db.transaction(async (tx) => {
      const lines = await tx
        .select({ rawText: recipeIngredients.rawText })
        .from(recipeIngredients)
        .where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.userId, userId)))
        .orderBy(asc(recipeIngredients.position));
      await tx.delete(recipeIngredients).where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.userId, userId)));
      await insertIngredients(tx, userId, id, lines.map((l) => l.rawText));
    });
  }
  const removed = await db
    .delete(items)
    .where(
      and(
        eq(items.userId, userId),
        notExists(db.select({ one: sql`1` }).from(recipeIngredients).where(eq(recipeIngredients.itemId, items.id))),
        notExists(db.select({ one: sql`1` }).from(groceryExtras).where(eq(groceryExtras.itemId, items.id))),
      ),
    )
    .returning({ id: items.id });
  return { recipes: recipeRows.length, itemsRemoved: removed.length };
}
