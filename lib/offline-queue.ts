import { z } from "zod";
import { isIsoDate, mondayOf } from "./dates";
import type { GroceryLine } from "./grocery";

export type ListChange =
  | { kind: "line"; week: string; key: string; checked: boolean; at: number }
  | { kind: "extra"; week: string; id: string; checked: boolean; at: number };
export type SyncStatus = "ok" | "stale" | "invalid";
export type SyncResult = { target: string; at: number; status: SyncStatus };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHANGES = 200;
const MAX_AGE_MS = 30 * 86_400_000;
const MAX_SKEW_MS = 5 * 60_000;

export function isListWeek(week: unknown): week is string {
  return typeof week === "string" && isIsoDate(week) && mondayOf(week) === week;
}

export function isLineKey(key: unknown): key is string {
  return typeof key === "string" && key.length <= 500 && /^(item|raw):/.test(key);
}

export function targetOf(change: ListChange): string {
  return change.kind === "line" ? `line:${change.week}:${change.key}` : `extra:${change.id}`;
}

/** Adds a change, replacing any older queued change to the same line or extra. */
export function enqueue(queue: ListChange[], change: ListChange): ListChange[] {
  const target = targetOf(change);
  return [...queue.filter((c) => targetOf(c) !== target), change];
}

/** Drops the changes that were sent; a newer change queued meanwhile for the same target stays. */
export function removeSynced(queue: ListChange[], sent: ListChange[]): ListChange[] {
  const sentKeys = new Set(sent.map((c) => `${targetOf(c)}@${c.at}`));
  return queue.filter((c) => !sentKeys.has(`${targetOf(c)}@${c.at}`));
}

/** The list as the user should see it: queued changes for this week override the checked state. */
export function applyPending<L extends Pick<GroceryLine, "key" | "extraId" | "checked">>(
  sections: { section: string; lines: L[] }[],
  queue: ListChange[],
  week: string,
): { section: string; lines: L[] }[] {
  const lineState = new Map<string, boolean>();
  const extraState = new Map<string, boolean>();
  for (const c of queue) {
    if (c.week !== week) continue;
    if (c.kind === "line") lineState.set(c.key, c.checked);
    else extraState.set(c.id, c.checked);
  }
  if (lineState.size === 0 && extraState.size === 0) return sections;
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => {
      const override = l.extraId ? extraState.get(l.extraId) : lineState.get(l.key);
      return override === undefined ? l : { ...l, checked: override };
    }),
  }));
}

export function parseSyncBody(body: unknown, now: number = Date.now()): { ok: true; changes: ListChange[] } | { ok: false } {
  const at = z.number().int().min(now - MAX_AGE_MS).max(now + MAX_SKEW_MS);
  const week = z.string().refine(isListWeek);
  const schema = z.object({
    changes: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("line"), week, key: z.string().refine(isLineKey), checked: z.boolean(), at }),
          z.object({ kind: z.literal("extra"), week, id: z.string().regex(UUID), checked: z.boolean(), at }),
        ]),
      )
      .max(MAX_CHANGES),
  });
  const result = schema.safeParse(body);
  return result.success ? { ok: true, changes: result.data.changes } : { ok: false };
}
