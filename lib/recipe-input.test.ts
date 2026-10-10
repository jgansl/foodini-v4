import { describe, expect, it } from "vitest";
import {
  EMPTY_RECIPE_FORM,
  draftToFormValues,
  readRecipeForm,
  recipeToFormValues,
  validateRecipe,
  type RecipeFormValues,
} from "./recipe-input";

const valid: RecipeFormValues = {
  title: "  Pancakes ",
  servings: "4",
  ingredients: "2 cups flour\n\n  1 cup milk  \r\n",
  steps: "Whisk.\nCook.\n",
  tags: "Breakfast, sweet, breakfast, ",
  sourceUrl: "",
  notes: "  ",
};
const withValues = (overrides: Partial<RecipeFormValues>) => validateRecipe({ ...valid, ...overrides });

describe("validateRecipe", () => {
  it("normalizes a valid form", () => {
    expect(validateRecipe(valid)).toEqual({
      ok: true,
      data: {
        title: "Pancakes",
        servings: 4,
        ingredients: ["2 cups flour", "1 cup milk"],
        steps: ["Whisk.", "Cook."],
        tags: ["breakfast", "sweet"],
        sourceUrl: null,
        notes: null,
      },
    });
  });

  it.each([
    [{ title: "   " }, "title", "Title is required"],
    [{ title: "x".repeat(201) }, "title", "Keep the title under 200 characters"],
    [{ servings: "" }, "servings", "Servings is required"],
    [{ servings: "abc" }, "servings", "Servings must be a number"],
    [{ servings: "2.5" }, "servings", "Servings must be a whole number"],
    [{ servings: "0" }, "servings", "At least 1 serving"],
    [{ servings: "101" }, "servings", "At most 100 servings"],
    [{ ingredients: " \n " }, "ingredients", "Add at least one ingredient"],
    [{ ingredients: "x".repeat(301) }, "ingredients", "Keep each ingredient under 300 characters"],
    [{ tags: "x".repeat(31) }, "tags", "Keep each tag under 30 characters"],
    [{ notes: "x".repeat(5001) }, "notes", "Keep notes under 5000 characters"],
  ] as const)("rejects %j", (overrides, field, message) => {
    expect(withValues(overrides)).toEqual({ ok: false, fieldErrors: { [field]: message } });
  });

  it("limits ingredients to 100 lines", () => {
    const lines = Array.from({ length: 101 }, (_, i) => `${i + 1} eggs`).join("\n");
    expect(withValues({ ingredients: lines })).toEqual({ ok: false, fieldErrors: { ingredients: "At most 100 ingredients" } });
  });

  it("rejects source URLs that are not http(s)", () => {
    for (const sourceUrl of ["javascript:alert(1)", "example.com", "ftp://example.com/x"]) {
      expect(withValues({ sourceUrl })).toEqual({ ok: false, fieldErrors: { sourceUrl: "Enter a full http(s) URL" } });
    }
    expect(withValues({ sourceUrl: "https://example.com/r" })).toMatchObject({ ok: true, data: { sourceUrl: "https://example.com/r" } });
  });

  it("reports several fields at once", () => {
    const result = withValues({ title: "", servings: "0" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["servings", "title"]);
  });
});

describe("readRecipeForm", () => {
  it("reads every field as a string, defaulting to empty", () => {
    const fd = new FormData();
    fd.set("title", "Soup");
    expect(readRecipeForm(fd)).toEqual({ ...EMPTY_RECIPE_FORM, title: "Soup" });
  });
});

describe("form value converters", () => {
  it("turns an import draft into form values", () => {
    expect(
      draftToFormValues({ title: "Soup", servings: null, ingredients: ["1 onion", "2 cups stock"], steps: ["Chop.", "Simmer."], tags: ["dinner", "soup"], sourceUrl: "https://example.com/soup" }),
    ).toEqual({ title: "Soup", servings: "", ingredients: "1 onion\n2 cups stock", steps: "Chop.\nSimmer.", tags: "dinner, soup", sourceUrl: "https://example.com/soup", notes: "" });
  });

  it("turns a saved recipe into form values that validate back to the same recipe", () => {
    const values = recipeToFormValues({ title: "Soup", servings: 2, ingredients: [{ rawText: "1 onion" }], steps: ["Chop."], tags: ["soup"], sourceUrl: null, notes: "Freezes well" });
    expect(values).toEqual({ title: "Soup", servings: "2", ingredients: "1 onion", steps: "Chop.", tags: "soup", sourceUrl: "", notes: "Freezes well" });
    expect(validateRecipe(values)).toEqual({
      ok: true,
      data: { title: "Soup", servings: 2, ingredients: ["1 onion"], steps: ["Chop."], tags: ["soup"], sourceUrl: null, notes: "Freezes well" },
    });
  });
});
