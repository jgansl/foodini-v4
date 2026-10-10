import { parseIngredient } from "./ingredients";
import { matchUnit, toBase, type UnitSystem } from "./units";

export type InventoryEntry = { itemId: string; unitKey: string; quantity: number; system: UnitSystem | null };

/** Inventory and deductions are keyed like grocery lines (D17): one item, one unit key. */
export function stockKey(itemId: string, unitKey: string): string {
  return `${itemId}|${unitKey}`;
}

export function splitStockKey(key: string): { itemId: string; unitKey: string } | null {
  const bar = key.indexOf("|");
  if (bar <= 0 || bar === key.length - 1) return null;
  return { itemId: key.slice(0, bar), unitKey: key.slice(bar + 1) };
}

export function stockMap(entries: InventoryEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = stockKey(e.itemId, e.unitKey);
    map.set(key, (map.get(key) ?? 0) + e.quantity);
  }
  return map;
}

/** Amounts below this are float noise from unit conversion, not stock. */
export const STOCK_EPSILON = 1e-6;

/** What cooking takes, per stock key: the scaled need, capped at what's on hand. Untracked lines take nothing. */
export function planDeductions(
  ingredients: { itemId: string | null; quantity: number | null; unit: string | null }[],
  factor: number,
  stock: Map<string, number>,
): Record<string, number> {
  const needed = new Map<string, number>();
  for (const ing of ingredients) {
    if (ing.itemId === null || ing.quantity === null) continue;
    const base = toBase(ing.quantity * factor, ing.unit);
    const key = stockKey(ing.itemId, base.unitKey);
    needed.set(key, (needed.get(key) ?? 0) + base.amount);
  }
  const deductions: Record<string, number> = {};
  for (const [key, amount] of needed) {
    const have = stock.get(key) ?? 0;
    // Within float noise of the whole stock: take all of it, so no 1e-14 sliver is left behind.
    const take = amount >= have - STOCK_EPSILON ? have : amount;
    if (take > STOCK_EPSILON) deductions[key] = take;
  }
  return deductions;
}

/**
 * Reads a typed amount ("3 cups", "500 g", "2", "3 cloves") for a row or line with `unitKey`.
 * Returns null when it isn't a positive amount of the same kind. A bare number counts for any count key.
 */
export function amountForKey(text: string, unitKey: string): { amount: number; system: UnitSystem | null } | null {
  const parsed = parseIngredient(text);
  if (parsed.quantity === null || parsed.quantity <= 0) return null;
  let unit = parsed.unit;
  if (parsed.name !== null) {
    // "3 cloves" can parse as the item "cloves"; accept it only if the whole name is a unit.
    const words = parsed.name.split(" ");
    const match = matchUnit(words);
    if (!match || match.consumed !== words.length || unit !== null) return null;
    unit = match.unit;
  }
  if (unit === null && unitKey.startsWith("count:")) return { amount: parsed.quantity, system: null };
  const base = toBase(parsed.quantity, unit);
  return base.unitKey === unitKey ? { amount: base.amount, system: base.system } : null;
}
