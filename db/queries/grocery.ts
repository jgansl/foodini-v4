import "server-only";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { groceryExtras, groceryMarks, items, planEntries, recipeIngredients, recipes } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { buildGroceryList, parseLineKey, type GroceryExtra, type GroceryIngredient, type GroceryList, type GroceryMark } from "@/lib/grocery";
import { normalizeItemName, parseIngredient } from "@/lib/ingredients";
import { amountForKey } from "@/lib/inventory";
import { toBase } from "@/lib/units";
import { isLineKey, isListWeek, targetOf, type ListChange, type SyncResult, type SyncStatus } from "@/lib/offline-queue";
import { adjustInventory, getStock, lockUser, shrinkDeductions } from "./inventory";
import { resolveItems } from "./items";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// `updated_at` for rows no device has checked or unchecked yet: older than any device time, so last-write-wins
// compares device clocks only with each other, never with the server's clock.
const SERVER_WRITTEN = new Date(0);

export async function loadWeekIngredients(userId: string, weekStart: string, conn: DbOrTx = db): Promise<GroceryIngredient[]> {
  return conn
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

export async function listMarks(userId: string, weekStart: string, conn: DbOrTx = db): Promise<GroceryMark[]> {
  return conn
    .select({ key: groceryMarks.key, checked: groceryMarks.checked, checkedQty: groceryMarks.checkedQty, hidden: groceryMarks.hidden })
    .from(groceryMarks)
    .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, weekStart)));
}

export async function listExtras(userId: string, weekStart: string, conn: DbOrTx = db): Promise<GroceryExtra[]> {
  return conn
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

export async function getGroceryList(
  userId: string,
  weekStart: string,
  opts: { showHidden?: boolean } = {},
  conn: DbOrTx = db,
): Promise<GroceryList> {
  const [ingredients, marks, extras, stock] = await Promise.all([
    loadWeekIngredients(userId, weekStart, conn),
    listMarks(userId, weekStart, conn),
    listExtras(userId, weekStart, conn),
    getStock(conn, userId),
  ]);
  return buildGroceryList(ingredients, marks, extras, { ...opts, inventory: stock });
}

async function upsertMark(
  tx: DbOrTx,
  userId: string,
  weekStart: string,
  key: string,
  patch: Partial<Pick<GroceryMark, "checked" | "checkedQty" | "hidden">> & { inInventory?: boolean },
  at?: Date,
) {
  // `updated_at` holds device times from check-offs only. A row created by Hide starts at the epoch, so a
  // queued check-off (stamped by a device clock that may run behind the server's) is never stale against it.
  const stamp = at ? { updatedAt: at } : {};
  await tx
    .insert(groceryMarks)
    .values({ userId, weekStart, key, ...patch, updatedAt: at ?? SERVER_WRITTEN })
    .onConflictDoUpdate({ target: [groceryMarks.userId, groceryMarks.weekStart, groceryMarks.key], set: { ...patch, ...stamp } });
}

const markFor = (tx: DbOrTx, userId: string, weekStart: string, key: string) =>
  tx
    .select({ checked: groceryMarks.checked, checkedQty: groceryMarks.checkedQty, inInventory: groceryMarks.inInventory })
    .from(groceryMarks)
    .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, weekStart), eq(groceryMarks.key, key)))
    .for("update");

/** Takes `qty` out of stock; whatever wasn't there is taken back from meals already cooked from it. */
async function takeBack(tx: DbOrTx, userId: string, itemId: string, unitKey: string, qty: number) {
  const clipped = await adjustInventory(tx, userId, itemId, unitKey, -qty, null);
  await shrinkDeductions(tx, userId, itemId, unitKey, clipped);
}

/**
 * Marks the line's current shortfall as bought and adds it to inventory, in one transaction. Amounts never come
 * from the client. The user lock makes the shortfall read and the writes one step, so concurrent checks of the
 * same line (two tabs flushing one queue) add it once.
 */
export async function checkGroceryLine(userId: string, weekStart: string, key: string, at: Date = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const list = await getGroceryList(userId, weekStart, { showHidden: true }, tx);
    const need = list.sections.flatMap((s) => s.lines).find((l) => l.kind === "need" && l.key === key);
    if (!need) return false;
    const [mark] = await markFor(tx, userId, weekStart, key);
    // A checked amount that never reached inventory (an older week's mark) isn't built on.
    const already = mark?.checked && mark.inInventory ? (mark.checkedQty ?? 0) : 0;
    const parts = parseLineKey(key);
    const counted = need.shortfallBase !== null && parts !== null;
    await upsertMark(
      tx,
      userId,
      weekStart,
      key,
      { checked: true, checkedQty: need.shortfallBase === null ? null : already + need.shortfallBase, inInventory: counted },
      at,
    );
    if (counted) await adjustInventory(tx, userId, parts.itemId, parts.unitKey, need.shortfallBase!, need.system);
    return true;
  });
}

/** Takes the bought amount back out of inventory and clears the mark. Does nothing to inventory if it never went in. */
export async function uncheckGroceryLine(userId: string, weekStart: string, key: string, at: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [mark] = await markFor(tx, userId, weekStart, key);
    const parts = parseLineKey(key);
    if (mark?.checked && mark.inInventory && mark.checkedQty !== null && parts) {
      await takeBack(tx, userId, parts.itemId, parts.unitKey, mark.checkedQty);
    }
    await upsertMark(tx, userId, weekStart, key, { checked: false, checkedQty: null, inInventory: false }, at);
  });
}

/** Changes how much of a checked line was bought; inventory moves by the difference. */
export async function setBoughtAmount(userId: string, weekStart: string, key: string, text: string): Promise<"ok" | "unreadable" | "missing"> {
  const parts = parseLineKey(key);
  if (!parts) return "missing";
  const amount = amountForKey(text, parts.unitKey);
  if (!amount) return "unreadable";
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [mark] = await markFor(tx, userId, weekStart, key);
    if (!mark?.checked || mark.checkedQty === null) return "missing";
    await upsertMark(tx, userId, weekStart, key, { checkedQty: amount.amount, inInventory: true });
    if (mark.inInventory) {
      const delta = amount.amount - mark.checkedQty;
      if (delta > 0) await adjustInventory(tx, userId, parts.itemId, parts.unitKey, delta, amount.system);
      else if (delta < 0) await takeBack(tx, userId, parts.itemId, parts.unitKey, -delta);
    } else {
      // The old amount never went in, so the whole new amount is what's bought now.
      await adjustInventory(tx, userId, parts.itemId, parts.unitKey, amount.amount, amount.system);
    }
    return "ok";
  });
}

export async function setGroceryLineHidden(userId: string, weekStart: string, key: string, hidden: boolean): Promise<void> {
  await upsertMark(db, userId, weekStart, key, { hidden });
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
        // No device has changed its checked state yet (see SERVER_WRITTEN).
        updatedAt: SERVER_WRITTEN,
        quantity: parsed.name ? parsed.quantity : null,
        unit: parsed.name ? parsed.unit : null,
      })
      .returning({ id: groceryExtras.id });
    return row.id;
  });
}

export async function setGroceryExtraChecked(userId: string, id: string, checked: boolean, at: Date = new Date()): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [extra] = await tx
      .select({
        checked: groceryExtras.checked,
        inInventory: groceryExtras.inInventory,
        itemId: groceryExtras.itemId,
        quantity: groceryExtras.quantity,
        unit: groceryExtras.unit,
      })
      .from(groceryExtras)
      .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
      .for("update");
    if (!extra) return false;
    // Inventory follows real changes only, so a repeated check (e.g. re-sent offline) adds nothing, and
    // unchecking takes back only what checking added.
    let inInventory = extra.inInventory;
    if (extra.checked !== checked && extra.itemId !== null && extra.quantity !== null) {
      const base = toBase(extra.quantity, extra.unit);
      if (checked) {
        await adjustInventory(tx, userId, extra.itemId, base.unitKey, base.amount, base.system);
        inInventory = true;
      } else if (extra.inInventory) {
        await takeBack(tx, userId, extra.itemId, base.unitKey, base.amount);
        inInventory = false;
      }
    }
    await tx
      .update(groceryExtras)
      .set({ checked, inInventory, updatedAt: at })
      .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)));
    return true;
  });
}

/** Applies queued device changes in order. Last write wins: a change older than the row is skipped. */
export async function applyGroceryChanges(userId: string, changes: ListChange[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const change of changes) {
    const at = new Date(change.at);
    const done = (status: SyncStatus) => results.push({ target: targetOf(change), at: change.at, status });
    if (change.kind === "line") {
      if (!isListWeek(change.week) || !isLineKey(change.key)) {
        done("invalid");
        continue;
      }
      const [mark] = await db
        .select({ updatedAt: groceryMarks.updatedAt })
        .from(groceryMarks)
        .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, change.week), eq(groceryMarks.key, change.key)));
      // `>=`: the same timestamp means this change was already applied (a re-sent batch).
      if (mark && mark.updatedAt >= at) {
        done("stale");
        continue;
      }
      if (change.checked) await checkGroceryLine(userId, change.week, change.key, at);
      else await uncheckGroceryLine(userId, change.week, change.key, at);
      done("ok");
    } else {
      if (!UUID.test(change.id)) {
        done("invalid");
        continue;
      }
      const [row] = await db
        .select({ updatedAt: groceryExtras.updatedAt })
        .from(groceryExtras)
        .where(and(eq(groceryExtras.id, change.id), eq(groceryExtras.userId, userId)));
      if (!row) done("invalid");
      else if (row.updatedAt >= at) done("stale");
      else {
        await setGroceryExtraChecked(userId, change.id, change.checked, at);
        done("ok");
      }
    }
  }
  return results;
}

export async function removeGroceryExtra(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(groceryExtras)
    .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
    .returning({ id: groceryExtras.id });
  return rows.length > 0;
}
