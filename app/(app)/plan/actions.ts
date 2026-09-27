"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addPlanEntry,
  movePlanEntry,
  movePlanEntryToDate,
  removePlanEntry,
  setPlanEntryCooked,
  updatePlanEntry,
} from "@/db/queries/plan";
import { isIsoDate, mondayOf } from "@/lib/dates";
import { parseAddEntry, parseEntryUpdate, type PlanFieldErrors } from "@/lib/plan-input";
import { requireUser } from "@/server/auth";

// Failed submissions return what was typed: React resets uncontrolled fields to their defaults
// after an action, so the forms use these values as defaults and nothing is lost.
export type AddEntryValues = { recipeId: string; date: string; servings: string; label: string };
export type AddEntryState = { fieldErrors: PlanFieldErrors; values: AddEntryValues } | null;
export type EntryEditState = { fieldErrors: PlanFieldErrors; values: { servings: string; label: string }; saved?: boolean } | null;

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function addPlanEntryAction(_prev: AddEntryState, formData: FormData): Promise<AddEntryState> {
  const user = await requireUser("/plan");
  const values = { recipeId: text(formData, "recipeId"), date: text(formData, "date"), servings: text(formData, "servings"), label: text(formData, "label") };
  const parsed = parseAddEntry(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  const id = await addPlanEntry(user.id, parsed.data);
  if (!id) return { fieldErrors: { recipeId: "Pick one of your recipes" }, values };
  revalidatePath("/plan");
  redirect(`/plan?week=${mondayOf(parsed.data.date)}`);
}

export async function updatePlanEntryAction(entryId: string, _prev: EntryEditState, formData: FormData): Promise<EntryEditState> {
  const user = await requireUser("/plan");
  const values = { servings: text(formData, "servings"), label: text(formData, "label") };
  const parsed = parseEntryUpdate(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  await updatePlanEntry(user.id, entryId, parsed.data);
  revalidatePath("/plan");
  return { fieldErrors: {}, values, saved: true };
}

export async function movePlanEntryAction(entryId: string, direction: "up" | "down"): Promise<void> {
  const user = await requireUser("/plan");
  await movePlanEntry(user.id, entryId, direction === "up" ? "up" : "down");
  revalidatePath("/plan");
}

export async function moveToDateAction(entryId: string, formData: FormData): Promise<void> {
  const user = await requireUser("/plan");
  const date = formData.get("date");
  if (typeof date === "string" && isIsoDate(date)) await movePlanEntryToDate(user.id, entryId, date);
  revalidatePath("/plan");
}

export async function setCookedAction(entryId: string, cooked: boolean): Promise<void> {
  const user = await requireUser("/plan");
  await setPlanEntryCooked(user.id, entryId, cooked === true);
  revalidatePath("/plan");
}

export async function removePlanEntryAction(entryId: string): Promise<void> {
  const user = await requireUser("/plan");
  await removePlanEntry(user.id, entryId);
  revalidatePath("/plan");
}
