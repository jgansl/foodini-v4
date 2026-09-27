import { z } from "zod";

export type RecipeFormValues = {
  title: string;
  servings: string;
  ingredients: string;
  steps: string;
  tags: string;
  sourceUrl: string;
  notes: string;
};

export type RecipeInput = {
  title: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl: string | null;
  notes: string | null;
};

export type FieldErrors = Partial<Record<keyof RecipeFormValues | "photo", string>>;

export const EMPTY_RECIPE_FORM: RecipeFormValues = {
  title: "",
  servings: "",
  ingredients: "",
  steps: "",
  tags: "",
  sourceUrl: "",
  notes: "",
};

const toLines = (s: string) => s.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const toTags = (s: string) => [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

const recipeSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep the title under 200 characters"),
  servings: z
    .string()
    .trim()
    .min(1, "Servings is required")
    .pipe(
      z.coerce
        .number({ error: "Servings must be a number" })
        .int("Servings must be a whole number")
        .min(1, "At least 1 serving")
        .max(100, "At most 100 servings"),
    ),
  ingredients: z
    .string()
    .transform(toLines)
    .pipe(
      z
        .array(z.string().max(300, "Keep each ingredient under 300 characters"))
        .min(1, "Add at least one ingredient")
        .max(100, "At most 100 ingredients"),
    ),
  steps: z
    .string()
    .transform(toLines)
    .pipe(z.array(z.string().max(2000, "Keep each step under 2000 characters")).max(100, "At most 100 steps")),
  tags: z
    .string()
    .transform(toTags)
    .pipe(z.array(z.string().max(30, "Keep each tag under 30 characters")).max(20, "At most 20 tags")),
  sourceUrl: z
    .string()
    .trim()
    .transform((s) => s || null)
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a full http(s) URL" }).nullable()),
  notes: z
    .string()
    .trim()
    .max(5000, "Keep notes under 5000 characters")
    .transform((s) => s || null),
});

export function readRecipeForm(fd: FormData): RecipeFormValues {
  const read = (key: keyof RecipeFormValues) => {
    const value = fd.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    title: read("title"),
    servings: read("servings"),
    ingredients: read("ingredients"),
    steps: read("steps"),
    tags: read("tags"),
    sourceUrl: read("sourceUrl"),
    notes: read("notes"),
  };
}

export function validateRecipe(
  values: RecipeFormValues,
): { ok: true; data: RecipeInput } | { ok: false; fieldErrors: FieldErrors } {
  const result = recipeSchema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const flat = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors: FieldErrors = {};
  for (const [field, messages] of Object.entries(flat)) {
    if (messages?.[0]) fieldErrors[field as keyof FieldErrors] = messages[0];
  }
  return { ok: false, fieldErrors };
}

export function draftToFormValues(d: {
  title: string;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl: string;
}): RecipeFormValues {
  return {
    title: d.title,
    servings: d.servings === null ? "" : String(d.servings),
    ingredients: d.ingredients.join("\n"),
    steps: d.steps.join("\n"),
    tags: d.tags.join(", "),
    sourceUrl: d.sourceUrl,
    notes: "",
  };
}

export function recipeToFormValues(r: {
  title: string;
  servings: number;
  ingredients: { rawText: string }[];
  steps: string[];
  tags: string[];
  sourceUrl: string | null;
  notes: string | null;
}): RecipeFormValues {
  return {
    title: r.title,
    servings: String(r.servings),
    ingredients: r.ingredients.map((i) => i.rawText).join("\n"),
    steps: r.steps.join("\n"),
    tags: r.tags.join(", "),
    sourceUrl: r.sourceUrl ?? "",
    notes: r.notes ?? "",
  };
}
