import "server-only";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { groceryExtras, groceryMarks, items, planEntries, recipeIngredients, recipes } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { buildGroceryList, type GroceryExtra, type GroceryIngredient, type GroceryList, type GroceryMark } from "@/lib/grocery";
import { normalizeItemName, parseIngredient } from "@/lib/ingredients";
import { resolveItems } from "./items";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadWeekIngredients(userId: string, weekStart: string): Promise<GroceryIngredient[]> {
  return db
    .select({
      recipeTitle: recipes.title,
      entryServings: planEntries.servings,
      recipeServings: recipes.servings,
      rawText: recipeIngredients.rawText,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      itemId: recipeIngredients.itemId,
      itemName: items.name,
      itemSection: items.section,
      itemUnitKind: items.unitKind,
    })
    .from(planEntries)
    .innerJoin(recipes, and(eq(recipes.id, planEntries.recipeId), eq(recipes.userId, userId)))
    .innerJoin(recipeIngredients, and(eq(recipeIngredients.recipeId, recipes.id), eq(recipeIngredients.userId, userId)))
    .leftJoin(items, and(eq(items.id, recipeIngredients.itemId), eq(items.userId, userId)))
    .where(
      and(
        eq(planEntries.userId, userId),
        gte(planEntries.date, weekStart),
        lte(planEntries.date, addDays(weekStart, 6)),
        isNull(planEntries.cookedAt),
      ),
    )
    .orderBy(asc(planEntries.date), asc(planEntries.position), asc(recipeIngredients.position));
}

export async function listMarks(userId: string, weekStart: string): Promise<GroceryMark[]> {
  return db
    .select({ key: groceryMarks.key, checked: groceryMarks.checked, checkedQty: groceryMarks.checkedQty, hidden: groceryMarks.hidden })
    .from(groceryMarks)
    .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, weekStart)));
}

export async function listExtras(userId: string, weekStart: string): Promise<GroceryExtra[]> {
  return db
    .select({
      id: groceryExtras.id,
      name: groceryExtras.name,
      quantity: groceryExtras.quantity,
      unit: groceryExtras.unit,
      section: items.section,
      checked: groceryExtras.checked,
    })
    .from(groceryExtras)
    .leftJoin(items, and(eq(items.id, groceryExtras.itemId), eq(items.userId, userId)))
    .where(and(eq(groceryExtras.userId, userId), eq(groceryExtras.weekStart, weekStart)))
    .orderBy(asc(groceryExtras.createdAt));
}

export async function getGroceryList(userId: string, weekStart: string, opts: { showHidden?: boolean } = {}): Promise<GroceryList> {
  const [ingredients, marks, extras] = await Promise.all([
    loadWeekIngredients(userId, weekStart),
    listMarks(userId, weekStart),
    listExtras(userId, weekStart),
  ]);
  return buildGroceryList(ingredients, marks, extras, opts);
}

async function upsertMark(userId: string, weekStart: string, key: string, patch: Partial<Pick<GroceryMark, "checked" | "checkedQty" | "hidden">>) {
  await db
    .insert(groceryMarks)
    .values({ userId, weekStart, key, ...patch })
    .onConflictDoUpdate({ target: [groceryMarks.userId, groceryMarks.weekStart, groceryMarks.key], set: { ...patch, updatedAt: new Date() } });
}

/** Marks the line's current shortfall as bought. The amount is always computed here, never taken from the client. */
export async function checkGroceryLine(userId: string, weekStart: string, key: string): Promise<boolean> {
  const list = await getGroceryList(userId, weekStart, { showHidden: true });
  const need = list.sections.flatMap((s) => s.lines).find((l) => l.kind === "need" && l.key === key);
  if (!need) return false;
  const [mark] = (await listMarks(userId, weekStart)).filter((m) => m.key === key);
  const already = mark?.checked ? (mark.checkedQty ?? 0) : 0;
  await upsertMark(userId, weekStart, key, { checked: true, checkedQty: need.shortfallBase === null ? null : already + need.shortfallBase });
  return true;
}

export async function uncheckGroceryLine(userId: string, weekStart: string, key: string): Promise<void> {
  await upsertMark(userId, weekStart, key, { checked: false, checkedQty: null });
}

export async function setGroceryLineHidden(userId: string, weekStart: string, key: string, hidden: boolean): Promise<void> {
  await upsertMark(userId, weekStart, key, { hidden });
}

export async function addGroceryExtra(userId: string, weekStart: string, text: string): Promise<string | null> {
  const parsed = parseIngredient(text);
  if (!parsed.raw) return null;
  return db.transaction(async (tx) => {
    const itemIds = parsed.name ? await resolveItems(tx, userId, [{ name: parsed.name, unit: parsed.unit }]) : new Map<string, string>();
    const [row] = await tx
      .insert(groceryExtras)
      .values({
        userId,
        weekStart,
        itemId: parsed.name ? (itemIds.get(normalizeItemName(parsed.name)) ?? null) : null,
        name: parsed.name ?? parsed.raw,
        quantity: parsed.name ? parsed.quantity : null,
        unit: parsed.name ? parsed.unit : null,
      })
      .returning({ id: groceryExtras.id });
    return row.id;
  });
}

export async function setGroceryExtraChecked(userId: string, id: string, checked: boolean): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .update(groceryExtras)
    .set({ checked })
    .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
    .returning({ id: groceryExtras.id });
  return rows.length > 0;
}

export async function removeGroceryExtra(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(groceryExtras)
    .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
    .returning({ id: groceryExtras.id });
  return rows.length > 0;
}
