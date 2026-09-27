import { describe, expect, it } from "vitest";
import { formatIngredient, normalizeItemName, parseIngredient } from "./ingredients";

describe("parseIngredient", () => {
  it.each([
    ["2 cups flour", { quantity: 2, unit: "cup", name: "flour", note: null }],
    ["1 ½ cups all-purpose flour, sifted", { quantity: 1.5, unit: "cup", name: "all-purpose flour", note: "sifted" }],
    ["1½ cups milk", { quantity: 1.5, unit: "cup", name: "milk", note: null }],
    ["1 1⁄2 cups stock", { quantity: 1.5, unit: "cup", name: "stock", note: null }],
    ["1/2 tsp salt", { quantity: 0.5, unit: "tsp", name: "salt", note: null }],
    ["2-3 cloves garlic, minced", { quantity: 3, unit: "clove", name: "garlic", note: "minced" }],
    ["2 to 3 tbsp olive oil", { quantity: 3, unit: "tbsp", name: "olive oil", note: null }],
    ["200g flour", { quantity: 200, unit: "g", name: "flour", note: null }],
    ["1.5 kg potatoes", { quantity: 1.5, unit: "kg", name: "potatoes", note: null }],
    ["3 eggs", { quantity: 3, unit: null, name: "eggs", note: null }],
    ["2 tomatoes", { quantity: 2, unit: null, name: "tomatoes", note: null }],
    ["2 large eggs, beaten", { quantity: 2, unit: null, name: "eggs", note: "large, beaten" }],
    ["1 (14 oz) can diced tomatoes, drained", { quantity: 1, unit: "can", name: "diced tomatoes", note: "14 oz, drained" }],
    ["a pinch of salt", { quantity: 1, unit: "pinch", name: "salt", note: null }],
    ["1 T olive oil", { quantity: 1, unit: "tbsp", name: "olive oil", note: null }],
    ["Salt to taste", { quantity: null, unit: null, name: "salt", note: "to taste" }],
    ["salt and pepper, to taste", { quantity: null, unit: null, name: "salt and pepper", note: "to taste" }],
    ["2 14-ounce cans chickpeas", { quantity: 2, unit: "can", name: "chickpeas", note: "14-ounce" }],
    ["1 28oz can crushed tomatoes, undrained", { quantity: 1, unit: "can", name: "crushed tomatoes", note: "28oz, undrained" }],
    ["1 x 400g tin tomatoes", { quantity: 1, unit: "can", name: "tomatoes", note: "400g" }],
    ["2 cloves", { quantity: 2, unit: null, name: "cloves", note: null }],
    ["3 whole cloves", { quantity: 3, unit: null, name: "whole cloves", note: null }],
    ["1 5 lb bag potatoes", { quantity: 1, unit: "bag", name: "potatoes", note: "5lb" }],
    ["2 12-ounce bottles beer", { quantity: 2, unit: "bottle", name: "beer", note: "12-ounce" }],
    ["1 9-inch pie crust", { quantity: 1, unit: null, name: "pie crust", note: "9-inch" }],
    ["2 3 lb chickens", { quantity: 2, unit: null, name: "chickens", note: "3lb" }],
    ["3 garlic cloves, minced", { quantity: 3, unit: "clove", name: "garlic", note: "minced" }],
    ["2 cinnamon sticks", { quantity: 2, unit: "stick", name: "cinnamon", note: null }],
    ["2 cans", { quantity: 2, unit: "can", name: null, note: null }],
    ["1 pinch", { quantity: 1, unit: "pinch", name: null, note: null }],
    ["8 oz", { quantity: 8, unit: "oz", name: null, note: null }],
    ["For the sauce:", { quantity: null, unit: null, name: null, note: null }],
    ["", { quantity: null, unit: null, name: null, note: null }],
  ])("parses %j", (raw, expected) => {
    expect(parseIngredient(raw)).toMatchObject(expected);
  });

  it("handles unicode thirds", () => {
    expect(parseIngredient("⅓ cup sugar")).toMatchObject({ quantity: expect.closeTo(1 / 3, 5), unit: "cup", name: "sugar" });
  });

  it("normalizes whitespace in raw", () => {
    expect(parseIngredient("  2   cups   water ").raw).toBe("2 cups water");
  });
});

describe("formatIngredient", () => {
  const f = (raw: string, factor: number) => formatIngredient(parseIngredient(raw), factor);

  it("shows the original line at factor 1", () => {
    expect(f("1 ½ cups all-purpose flour, sifted", 1)).toBe("1 ½ cups all-purpose flour, sifted");
  });
  it("scales quantities and pluralizes units", () => {
    expect(f("2 cups flour", 2)).toBe("4 cups flour");
    expect(f("1 cup milk", 0.5)).toBe("½ cup milk");
    expect(f("1 ⅓ cups sugar", 1.5)).toBe("2 cups sugar");
    expect(f("8 oz", 2)).toBe("16 oz");
  });
  it("puts notes in parentheses when scaled", () => {
    expect(f("2 large eggs, beaten", 0.5)).toBe("1 eggs (large, beaten)");
  });
  it("leaves lines without a quantity unchanged", () => {
    expect(f("Salt to taste", 2)).toBe("Salt to taste");
    expect(f("For the sauce:", 2)).toBe("For the sauce:");
  });
});

describe("normalizeItemName", () => {
  it.each([
    ["Eggs", "egg"],
    ["tomatoes", "tomato"],
    ["cherries", "cherry"],
    ["peaches", "peach"],
    ["pies", "pie"],
    ["boxes", "box"],
    ["hummus", "hummus"],
    ["swiss", "swiss"],
    ["  Green   Onions ", "green onion"],
    ["all-purpose flour", "all-purpose flour"],
    ["rice", "rice"],
    ["bay leaves", "bay leaf"],
    ["loaves", "loaf"],
    ["halves", "half"],
    ["olives", "olive"],
    ["cloves", "clove"],
    ["molasses", "molasses"],
    ["couscous", "couscous"],
    ["asparagus", "asparagus"],
    ["", ""],
  ])("normalizes %j to %j", (name, key) => {
    expect(normalizeItemName(name)).toBe(key);
  });
});
