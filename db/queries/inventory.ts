import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { inventory, items } from "@/db/schema";
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

/** Adds `delta` (may be negative) in base units, never below 0; a row reaching 0 (within float noise) is deleted. */
export async function adjustInventory(
  tx: DbOrTx,
  userId: string,
  itemId: string,
  unitKey: string,
  delta: number,
  system: UnitSystem | null,
): Promise<void> {
  if (delta === 0) return;
  await tx
    .insert(inventory)
    .values({ userId, itemId, unitKey, quantity: Math.max(0, delta), system })
    .onConflictDoUpdate({
      target: [inventory.userId, inventory.itemId, inventory.unitKey],
      set: {
        quantity: sql`greatest(0, ${inventory.quantity} + ${delta}::numeric)`,
        system: sql`coalesce(excluded.system, ${inventory.system})`,
        updatedAt: new Date(),
      },
    });
  await tx.delete(inventory).where(and(owned(userId, itemId, unitKey), lte(inventory.quantity, STOCK_EPSILON)));
}

/** "2 lb flour" → adds to that item's stock. Needs an amount and an item. */
export async function addStockFromText(userId: string, text: string): Promise<"ok" | "unreadable"> {
  const parsed = parseIngredient(text);
  if (parsed.quantity === null || parsed.quantity <= 0 || parsed.name === null) return "unreadable";
  const base = toBase(parsed.quantity, parsed.unit);
  await db.transaction(async (tx) => {
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
  const rows = await db
    .update(inventory)
    .set({ quantity: amount.amount, system: amount.system ?? sql`${inventory.system}`, updatedAt: new Date() })
    .where(owned(userId, itemId, unitKey))
    .returning({ itemId: inventory.itemId });
  return rows.length > 0 ? "ok" : "missing";
}

export async function removeStock(userId: string, itemId: string, unitKey: string): Promise<boolean> {
  if (!UUID.test(itemId) || !UNIT_KEY.test(unitKey)) return false;
  const rows = await db.delete(inventory).where(owned(userId, itemId, unitKey)).returning({ itemId: inventory.itemId });
  return rows.length > 0;
}
