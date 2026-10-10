import { z } from "zod";
import { isIsoDate } from "./dates";

export type PlanEntryInput = { recipeId: string; date: string; servings: number | null; label: string | null };
export type PlanEntryUpdate = { servings: number; label: string | null };
export type PlanFieldErrors = Partial<Record<"recipeId" | "date" | "servings" | "label", string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const servingsNumber = z.coerce
  .number<string>({ error: "Servings must be a number" })
  .positive("Servings must be more than 0")
  .max(100, "At most 100 servings")
  .refine((n) => Number.isInteger(n * 2), "Use whole or half servings");

const label = z
  .string()
  .trim()
  .max(40, "Keep the label under 40 characters")
  .transform((s) => s || null);

const addSchema = z.object({
  recipeId: z.string().regex(UUID, "Pick a recipe"),
  date: z.string().refine(isIsoDate, "Pick a valid day"),
  servings: z
    .string()
    .trim()
    .transform((s) => s || null)
    .pipe(servingsNumber.nullable()),
  label,
});

const updateSchema = z.object({
  servings: z.string().trim().min(1, "Servings is required").pipe(servingsNumber),
  label,
});

const read = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" ? value : "";
};

function firstErrors(error: z.ZodError): PlanFieldErrors {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  const errors: PlanFieldErrors = {};
  for (const [field, messages] of Object.entries(flat)) {
    if (messages?.[0]) errors[field as keyof PlanFieldErrors] = messages[0];
  }
  return errors;
}

export function parseAddEntry(fd: FormData): { ok: true; data: PlanEntryInput } | { ok: false; fieldErrors: PlanFieldErrors } {
  const result = addSchema.safeParse({ recipeId: read(fd, "recipeId"), date: read(fd, "date"), servings: read(fd, "servings"), label: read(fd, "label") });
  return result.success ? { ok: true, data: result.data } : { ok: false, fieldErrors: firstErrors(result.error) };
}

export function parseEntryUpdate(fd: FormData): { ok: true; data: PlanEntryUpdate } | { ok: false; fieldErrors: PlanFieldErrors } {
  const result = updateSchema.safeParse({ servings: read(fd, "servings"), label: read(fd, "label") });
  return result.success ? { ok: true, data: result.data } : { ok: false, fieldErrors: firstErrors(result.error) };
}
