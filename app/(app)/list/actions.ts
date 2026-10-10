"use server";

import { revalidatePath } from "next/cache";
import { addGroceryExtra, removeGroceryExtra, setBoughtAmount, setGroceryLineHidden } from "@/db/queries/grocery";
// Keys come from the page, so a forged one may arrive: accept only well-formed keys for a real Monday.
import { isLineKey, isListWeek } from "@/lib/offline-queue";
import { requireUser } from "@/server/auth";

export type AddExtraState = { error?: string; text?: string } | null;

export async function hideLineAction(week: string, key: string, hidden: boolean): Promise<void> {
  const user = await requireUser("/list");
  if (!isListWeek(week) || !isLineKey(key)) return;
  await setGroceryLineHidden(user.id, week, key, hidden === true);
  revalidatePath("/list");
}

export async function addExtraAction(week: string, _prev: AddExtraState, formData: FormData): Promise<AddExtraState> {
  const user = await requireUser("/list");
  const text = String(formData.get("text") ?? "").trim();
  if (!isListWeek(week)) return { error: "That week isn't valid.", text };
  if (!text) return { error: "Type an item to add.", text };
  if (text.length > 200) return { error: "Keep items under 200 characters.", text };
  await addGroceryExtra(user.id, week, text);
  revalidatePath("/list");
  return null;
}

export async function removeExtraAction(id: string): Promise<void> {
  const user = await requireUser("/list");
  await removeGroceryExtra(user.id, id);
  revalidatePath("/list");
}

export type BoughtAmountState = { error?: string; text?: string; saved?: boolean } | null;

export async function setBoughtAmountAction(week: string, key: string, _prev: BoughtAmountState, formData: FormData): Promise<BoughtAmountState> {
  const user = await requireUser("/list");
  const text = String(formData.get("amount") ?? "").trim();
  if (!isListWeek(week) || !isLineKey(key)) return { error: "That line isn't on this list.", text };
  const result = await setBoughtAmount(user.id, week, key, text);
  if (result === "unreadable") return { error: "Enter an amount of the same kind, e.g. 3 cups, 500 g or 2.", text };
  if (result === "missing") return { error: "Check the item off first.", text };
  revalidatePath("/list");
  revalidatePath("/inventory");
  return { saved: true };
}
