"use server";

import { revalidatePath } from "next/cache";
import { addStockFromText, removeStock, setStockAmount } from "@/db/queries/inventory";
import { requireUser } from "@/server/auth";

export type StockFormState = { error?: string; text?: string } | null;

const refresh = () => {
  revalidatePath("/inventory");
  revalidatePath("/list");
};

export async function addStockAction(_prev: StockFormState, formData: FormData): Promise<StockFormState> {
  const user = await requireUser("/inventory");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Type an amount and an item, e.g. 2 lb flour.", text };
  if (text.length > 200) return { error: "Keep it under 200 characters.", text };
  if ((await addStockFromText(user.id, text)) === "unreadable") return { error: "Include an amount and an item, e.g. 2 lb flour.", text };
  refresh();
  return null;
}

export async function setStockAction(itemId: string, unitKey: string, _prev: StockFormState, formData: FormData): Promise<StockFormState> {
  const user = await requireUser("/inventory");
  const text = String(formData.get("amount") ?? "").trim();
  const result = await setStockAmount(user.id, itemId, unitKey, text);
  if (result === "unreadable") {
    const example = unitKey === "volume" ? "2 cups" : unitKey === "weight" ? "500 g" : "3";
    return { error: `Enter a ${unitKey.startsWith("count:") ? "count" : unitKey} amount, e.g. ${example}.`, text };
  }
  if (result === "missing") return { error: "That item isn't in your inventory any more.", text };
  refresh();
  return null;
}

export async function removeStockAction(itemId: string, unitKey: string): Promise<void> {
  const user = await requireUser("/inventory");
  await removeStock(user.id, itemId, unitKey);
  refresh();
}
