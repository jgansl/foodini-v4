import "server-only";
import { and, asc, count, desc, eq, gt, gte, lt, lte, max } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { planEntries, recipes } from "@/db/schema";
import { addDays } from "@/lib/dates";
import type { PlanEntryInput, PlanEntryUpdate } from "@/lib/plan-input";

export type PlanEntryView = {
  id: string;
  date: string;
  position: number;
  recipeId: string;
  recipeTitle: string;
  recipeServings: number;
  servings: number;
  label: string | null;
  cookedAt: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const owned = (userId: string, id: string) => and(eq(planEntries.id, id), eq(planEntries.userId, userId));

async function nextPosition(tx: DbOrTx, userId: string, date: string): Promise<number> {
  const [row] = await tx
    .select({ top: max(planEntries.position) })
    .from(planEntries)
    .where(and(eq(planEntries.userId, userId), eq(planEntries.date, date)));
  return (row?.top ?? -1) + 1;
}

export async function listWeek(userId: string, weekStart: string): Promise<PlanEntryView[]> {
  return db
    .select({
      id: planEntries.id,
      date: planEntries.date,
      position: planEntries.position,
      recipeId: planEntries.recipeId,
      recipeTitle: recipes.title,
      recipeServings: recipes.servings,
      servings: planEntries.servings,
      label: planEntries.label,
      cookedAt: planEntries.cookedAt,
    })
    .from(planEntries)
    .innerJoin(recipes, and(eq(recipes.id, planEntries.recipeId), eq(recipes.userId, userId)))
    .where(and(eq(planEntries.userId, userId), gte(planEntries.date, weekStart), lte(planEntries.date, addDays(weekStart, 6))))
    .orderBy(asc(planEntries.date), asc(planEntries.position));
}

export async function addPlanEntry(userId: string, input: PlanEntryInput): Promise<string | null> {
  if (!UUID.test(input.recipeId)) return null;
  return db.transaction(async (tx) => {
    const [recipe] = await tx
      .select({ servings: recipes.servings })
      .from(recipes)
      .where(and(eq(recipes.id, input.recipeId), eq(recipes.userId, userId)));
    if (!recipe) return null;
    const position = await nextPosition(tx, userId, input.date);
    const [row] = await tx
      .insert(planEntries)
      .values({ userId, recipeId: input.recipeId, date: input.date, position, servings: input.servings ?? recipe.servings, label: input.label })
      .returning({ id: planEntries.id });
    return row.id;
  });
}

export async function updatePlanEntry(userId: string, id: string, update: PlanEntryUpdate): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db.update(planEntries).set(update).where(owned(userId, id)).returning({ id: planEntries.id });
  return rows.length > 0;
}

/** Swaps the entry with its neighbour on the same day. False when it is already first/last. */
export async function movePlanEntry(userId: string, id: string, direction: "up" | "down"): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const [entry] = await tx.select({ date: planEntries.date, position: planEntries.position }).from(planEntries).where(owned(userId, id));
    if (!entry) return false;
    const sameDay = and(eq(planEntries.userId, userId), eq(planEntries.date, entry.date));
    const [neighbour] = await tx
      .select({ id: planEntries.id, position: planEntries.position })
      .from(planEntries)
      .where(and(sameDay, direction === "up" ? lt(planEntries.position, entry.position) : gt(planEntries.position, entry.position)))
      .orderBy(direction === "up" ? desc(planEntries.position) : asc(planEntries.position))
      .limit(1);
    if (!neighbour) return false;
    await tx.update(planEntries).set({ position: neighbour.position }).where(owned(userId, id));
    await tx.update(planEntries).set({ position: entry.position }).where(owned(userId, neighbour.id));
    return true;
  });
}

export async function movePlanEntryToDate(userId: string, id: string, date: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const [entry] = await tx.select({ date: planEntries.date }).from(planEntries).where(owned(userId, id));
    if (!entry) return false;
    if (entry.date === date) return true;
    const position = await nextPosition(tx, userId, date);
    await tx.update(planEntries).set({ date, position }).where(owned(userId, id));
    return true;
  });
}

export async function setPlanEntryCooked(userId: string, id: string, cooked: boolean): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .update(planEntries)
    .set({ cookedAt: cooked ? new Date() : null })
    .where(owned(userId, id))
    .returning({ id: planEntries.id });
  return rows.length > 0;
}

export async function removePlanEntry(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db.delete(planEntries).where(owned(userId, id)).returning({ id: planEntries.id });
  return rows.length > 0;
}

export async function countPlanned(userId: string, recipeId: string): Promise<number> {
  if (!UUID.test(recipeId)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(planEntries)
    .where(and(eq(planEntries.userId, userId), eq(planEntries.recipeId, recipeId)));
  return row?.n ?? 0;
}
