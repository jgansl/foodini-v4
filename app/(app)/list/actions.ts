"use server";

import { revalidatePath } from "next/cache";
import {
  addGroceryExtra,
  checkGroceryLine,
  removeGroceryExtra,
  setGroceryExtraChecked,
  setGroceryLineHidden,
  uncheckGroceryLine,
} from "@/db/queries/grocery";
import { isIsoDate, mondayOf } from "@/lib/dates";
import { requireUser } from "@/server/auth";

export type AddExtraState = { error?: string; text?: string } | null;

// Keys come from the page, so a forged one may arrive: accept only well-formed keys for a real Monday.
const validWeek = (week: unknown): week is string => typeof week === "string" && isIsoDate(week) && mondayOf(week) === week;
const validKey = (key: unknown): key is string => typeof key === "string" && key.length <= 500 && /^(item|raw):/.test(key);

export async function toggleLineAction(week: string, key: string, checked: boolean): Promise<void> {
  const user = await requireUser("/list");
  if (!validWeek(week) || !validKey(key)) return;
  if (checked === true) await checkGroceryLine(user.id, week, key);
  else await uncheckGroceryLine(user.id, week, key);
  revalidatePath("/list");
}

export async function hideLineAction(week: string, key: string, hidden: boolean): Promise<void> {
  const user = await requireUser("/list");
  if (!validWeek(week) || !validKey(key)) return;
  await setGroceryLineHidden(user.id, week, key, hidden === true);
  revalidatePath("/list");
}

export async function addExtraAction(week: string, _prev: AddExtraState, formData: FormData): Promise<AddExtraState> {
  const user = await requireUser("/list");
  const text = String(formData.get("text") ?? "").trim();
  if (!validWeek(week)) return { error: "That week isn't valid.", text };
  if (!text) return { error: "Type an item to add.", text };
  if (text.length > 200) return { error: "Keep items under 200 characters.", text };
  await addGroceryExtra(user.id, week, text);
  revalidatePath("/list");
  return null;
}

export async function toggleExtraAction(id: string, checked: boolean): Promise<void> {
  const user = await requireUser("/list");
  await setGroceryExtraChecked(user.id, id, checked === true);
  revalidatePath("/list");
}

export async function removeExtraAction(id: string): Promise<void> {
  const user = await requireUser("/list");
  await removeGroceryExtra(user.id, id);
  revalidatePath("/list");
}
