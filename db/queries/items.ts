import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { items } from "@/db/schema";
import { normalizeItemName } from "@/lib/ingredients";
import { sectionFor } from "@/lib/sections";
import { unitKind } from "@/lib/units";

/**
 * Finds or creates one item per distinct normalized name for this user.
 * Returns normalized key → item id. New items get a default section and the unit kind of the
 * first unit they appear with (count when there is none).
 */
export async function resolveItems(
  tx: DbOrTx,
  userId: string,
  entries: { name: string; unit: string | null }[],
): Promise<Map<string, string>> {
  const byKey = new Map<string, { name: string; unit: string | null }>();
  for (const entry of entries) {
    const key = normalizeItemName(entry.name);
    if (key && !byKey.has(key)) byKey.set(key, entry);
  }
  if (byKey.size === 0) return new Map();

  await tx
    .insert(items)
    .values(
      [...byKey].map(([key, entry]) => ({
        userId,
        key,
        name: entry.name,
        section: sectionFor(entry.name),
        unitKind: entry.unit ? unitKind(entry.unit) : ("count" as const),
      })),
    )
    .onConflictDoNothing({ target: [items.userId, items.key] });

  const rows = await tx
    .select({ id: items.id, key: items.key })
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.key, [...byKey.keys()])));
  return new Map(rows.map((r) => [r.key, r.id]));
}
