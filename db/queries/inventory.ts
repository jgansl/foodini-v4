import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { inventory, items, planEntries } from "@/db/schema";
import { normalizeItemName, parseIngredient } from "@/lib/ingredients";
import { amountForKey, STOCK_EPSILON, type InventoryEntry } from "@/lib/inventory";
import { toBase, type UnitSystem } from "@/lib/units";
import { resolveItems } from "./items";

export type StockRow = InventoryEntry & { name: string; section: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIT_KEY = /^(volume|weight|count:[a-z ]+)$/;
const owned = (userId: string, itemId: string, unitKey: string) =>
  and(eq(inventory.userId, userId), eq(inventory.itemId, itemId), eq(inventory.unitKey, unitKey));
const asSystem = (s: string | null): UnitSystem | null => (s === "us" || s === "metric" ? s : null);

export async function listInventory(userId: string): Promise<StockRow[]> {
  const rows = await db
    .select({
      itemId: inventory.itemId,
      unitKey: inventory.unitKey,
      quantity: inventory.quantity,
      system: inventory.system,
      name: items.name,
      section: items.section,
    })
    .from(inventory)
    .innerJoin(items, and(eq(items.id, inventory.itemId), eq(items.userId, userId)))
    .where(eq(inventory.userId, userId))
    .orderBy(asc(items.section), asc(items.name), asc(inventory.unitKey));
  return rows.map((r) => ({ ...r, system: asSystem(r.system) }));
}

export async function getStock(tx: DbOrTx, userId: string): Promise<InventoryEntry[]> {
  const rows = await tx
    .select({ itemId: inventory.itemId, unitKey: inventory.unitKey, quantity: inventory.quantity, system: inventory.system })
    .from(inventory)
    .where(eq(inventory.userId, userId));
  return rows.map((r) => ({ ...r, system: asSystem(r.system) }));
}

/**
 * Serializes one user's inventory changes for the rest of the transaction. Check-offs, cooking and edits all
 * read stock and then write it, so two at once (two tabs, two devices) would otherwise count amounts twice.
 */
export async function lockUser(tx: DbOrTx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}

/**
 * Adds `delta` (may be negative) in base units, never below 0; a row reaching 0 (within float noise) is deleted.
 * Returns how much of a negative delta couldn't be taken because there wasn't that much on hand.
 */
export async function adjustInventory(
  tx: DbOrTx,
  userId: string,
  itemId: string,
  unitKey: string,
  delta: number,
  system: UnitSystem | null,
): Promise<number> {
  if (delta === 0) return 0;
  if (delta > 0) {
    await tx
      .insert(inventory)
      .values({ userId, itemId, unitKey, quantity: delta, system })
      .onConflictDoUpdate({
        target: [inventory.userId, inventory.itemId, inventory.unitKey],
        set: {
          quantity: sql`${inventory.quantity} + ${delta}::numeric`,
          system: sql`coalesce(excluded.system, ${inventory.system})`,
          updatedAt: new Date(),
        },
      });
    return 0;
  }
  const [row] = await tx.select({ quantity: inventory.quantity }).from(inventory).where(owned(userId, itemId, unitKey)).for("update");
  const have = row?.quantity ?? 0;
  const taken = Math.min(have, -delta);
  if (row) {
    if (have - taken <= STOCK_EPSILON) await tx.delete(inventory).where(owned(userId, itemId, unitKey));
    else await tx.update(inventory).set({ quantity: have - taken, updatedAt: new Date() }).where(owned(userId, itemId, unitKey));
  }
  const clipped = -delta - taken;
  return clipped > STOCK_EPSILON ? clipped : 0;
}

/**
 * Stock that was removed after cooked meals had already used it can't be put back by un-cooking them.
 * Shrinks the most recent meals' recorded deductions for that key by `amount`, so the round trip stays exact.
 */
export async function shrinkDeductions(tx: DbOrTx, userId: string, itemId: string, unitKey: string, amount: number): Promise<void> {
  if (amount <= STOCK_EPSILON) return;
  const key = `${itemId}|${unitKey}`;
  const rows = await tx
    .select({ id: planEntries.id, deducted: planEntries.deducted })
    .from(planEntries)
    .where(and(eq(planEntries.userId, userId), sql`${planEntries.cookedAt} is not null and jsonb_exists(${planEntries.deducted}, ${key})`))
    .orderBy(desc(planEntries.cookedAt))
    .for("update");
  let remaining = amount;
  for (const row of rows) {
    if (remaining <= STOCK_EPSILON) break;
    const deducted = { ...(row.deducted ?? {}) };
    const take = Math.min(deducted[key] ?? 0, remaining);
    remaining -= take;
    const left = (deducted[key] ?? 0) - take;
    if (left <= STOCK_EPSILON) delete deducted[key];
    else deducted[key] = left;
    await tx.update(planEntries).set({ deducted }).where(eq(planEntries.id, row.id));
  }
}

/** "2 lb flour" → adds to that item's stock. Needs an amount and an item. */
export async function addStockFromText(userId: string, text: string): Promise<"ok" | "unreadable"> {
  const parsed = parseIngredient(text);
  if (parsed.quantity === null || parsed.quantity <= 0 || parsed.name === null) return "unreadable";
  const base = toBase(parsed.quantity, parsed.unit);
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const ids = await resolveItems(tx, userId, [{ name: parsed.name!, unit: parsed.unit }]);
    const itemId = ids.get(normalizeItemName(parsed.name!))!;
    await adjustInventory(tx, userId, itemId, base.unitKey, base.amount, base.system);
  });
  return "ok";
}

export async function setStockAmount(
  userId: string,
  itemId: string,
  unitKey: string,
  text: string,
): Promise<"ok" | "unreadable" | "missing"> {
  if (!UUID.test(itemId) || !UNIT_KEY.test(unitKey)) return "missing";
  const amount = amountForKey(text, unitKey);
  if (!amount) return "unreadable";
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const rows = await tx
      .update(inventory)
      .set({ quantity: amount.amount, system: amount.system ?? sql`${inventory.system}`, updatedAt: new Date() })
      .where(owned(userId, itemId, unitKey))
      .returning({ itemId: inventory.itemId });
    return rows.length > 0 ? "ok" : "missing";
  });
}

export async function removeStock(userId: string, itemId: string, unitKey: string): Promise<boolean> {
  if (!UUID.test(itemId) || !UNIT_KEY.test(unitKey)) return false;
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const rows = await tx.delete(inventory).where(owned(userId, itemId, unitKey)).returning({ itemId: inventory.itemId });
    return rows.length > 0;
  });
}
