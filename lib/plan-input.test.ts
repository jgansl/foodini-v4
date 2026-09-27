import { describe, expect, it } from "vitest";
import { parseAddEntry, parseEntryUpdate } from "./plan-input";

const RECIPE = "3f0f06de-0fbf-4e77-87d2-5b0c4712972b";
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("parseAddEntry", () => {
  it("reads a full entry", () => {
    expect(parseAddEntry(form({ recipeId: RECIPE, date: "2026-09-28", servings: "2.5", label: "  Dinner " }))).toEqual({
      ok: true,
      data: { recipeId: RECIPE, date: "2026-09-28", servings: 2.5, label: "Dinner" },
    });
  });

  it("treats blank servings as the recipe's and a blank label as none", () => {
    expect(parseAddEntry(form({ recipeId: RECIPE, date: "2026-09-28", servings: " ", label: "" }))).toEqual({
      ok: true,
      data: { recipeId: RECIPE, date: "2026-09-28", servings: null, label: null },
    });
  });

  it.each([
    [{ recipeId: "" }, "recipeId", "Pick a recipe"],
    [{ recipeId: "not-a-uuid" }, "recipeId", "Pick a recipe"],
    [{ date: "2026-02-30" }, "date", "Pick a valid day"],
    [{ date: "" }, "date", "Pick a valid day"],
    [{ servings: "abc" }, "servings", "Servings must be a number"],
    [{ servings: "0" }, "servings", "Servings must be more than 0"],
    [{ servings: "101" }, "servings", "At most 100 servings"],
    [{ servings: "1.3" }, "servings", "Use whole or half servings"],
    [{ label: "x".repeat(41) }, "label", "Keep the label under 40 characters"],
  ])("rejects %j", (override, field, message) => {
    const fields = { recipeId: RECIPE, date: "2026-09-28", servings: "", label: "", ...override };
    expect(parseAddEntry(form(fields))).toEqual({ ok: false, fieldErrors: { [field]: message } });
  });
});

describe("parseEntryUpdate", () => {
  it("requires servings", () => {
    expect(parseEntryUpdate(form({ servings: "", label: "" }))).toEqual({ ok: false, fieldErrors: { servings: "Servings is required" } });
  });

  it("reads servings and label", () => {
    expect(parseEntryUpdate(form({ servings: "3", label: "Lunch" }))).toEqual({ ok: true, data: { servings: 3, label: "Lunch" } });
  });
});
