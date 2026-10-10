import { describe, expect, it } from "vitest";
import type { InventoryEntry } from "./inventory";
import { buildGroceryList, parseLineKey, rawKey, type GroceryExtra, type GroceryIngredient, type GroceryMark } from "./grocery";

const FLOUR = { itemId: "i-flour", itemName: "flour", itemSection: "pantry", itemUnitKind: "volume" as const };
const MILK = { itemId: "i-milk", itemName: "milk", itemSection: "dairy & eggs", itemUnitKind: "volume" as const };
const TOMATO = { itemId: "i-tomato", itemName: "tomatoes", itemSection: "produce", itemUnitKind: "count" as const };
const SALT = { itemId: "i-salt", itemName: "salt", itemSection: "spices", itemUnitKind: "count" as const };

const stock = (itemId: string, unitKey: string, quantity: number, system: InventoryEntry["system"] = "us"): InventoryEntry => ({
  itemId, unitKey, quantity, system,
});

function ing(overrides: Partial<GroceryIngredient>): GroceryIngredient {
  return {
    recipeTitle: "Pancakes", entryServings: 4, recipeServings: 4, rawText: "x", quantity: null, unit: null,
    itemId: null, itemName: null, itemSection: null, itemUnitKind: null, ...overrides,
  };
}
const labels = (list: ReturnType<typeof buildGroceryList>) =>
  list.sections.flatMap((s) => s.lines.map((l) => `${s.section}: ${l.checked ? "✓ " : ""}${l.label}`));

describe("buildGroceryList", () => {
  it("scales by servings and merges an item across recipes", () => {
    const list = buildGroceryList(
      [
        ing({ ...FLOUR, rawText: "2 cups flour", quantity: 2, unit: "cup", entryServings: 2, recipeServings: 4 }),
        ing({ ...FLOUR, rawText: "1 cup flour", quantity: 1, unit: "cup", recipeTitle: "Bread" }),
      ],
      [],
      [],
    );
    expect(labels(list)).toEqual(["pantry: 2 cups flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ id: "item:i-flour:volume", key: "item:i-flour:volume", kind: "need", recipes: ["Bread", "Pancakes"], shortfallBase: expect.closeTo(473.176, 2) });
  });

  it("converts within a kind to a readable unit", () => {
    const list = buildGroceryList(
      [ing({ ...MILK, quantity: 1, unit: "cup" }), ing({ ...MILK, quantity: 8, unit: "tbsp" })],
      [],
      [],
    );
    expect(labels(list)).toEqual(["dairy & eggs: 1 ½ cups milk"]);
  });

  it("shows metric when any contribution was metric", () => {
    const list = buildGroceryList(
      [ing({ ...FLOUR, itemUnitKind: "weight", quantity: 200, unit: "g" }), ing({ ...FLOUR, itemUnitKind: "weight", quantity: 1, unit: "lb" })],
      [],
      [],
    );
    expect(labels(list)).toEqual(["pantry: 654 g flour"]);
  });

  it("keeps different unit kinds and different count units apart", () => {
    const list = buildGroceryList(
      [
        ing({ ...FLOUR, quantity: 2, unit: "cup" }),
        ing({ ...FLOUR, quantity: 200, unit: "g" }),
        ing({ ...TOMATO, quantity: 1, unit: "can" }),
        ing({ ...TOMATO, quantity: 3, unit: null }),
      ],
      [],
      [],
    );
    expect(labels(list)).toEqual(["produce: 1 can tomatoes", "produce: 3 tomatoes", "pantry: 2 cups flour", "pantry: 200 g flour"]);
  });

  it("merges an amount-less line into the item's amount line, or lists it without an amount", () => {
    const withAmount = buildGroceryList([ing({ ...SALT, itemUnitKind: "volume", quantity: 1, unit: "tsp" }), ing({ ...SALT, itemUnitKind: "volume", rawText: "Salt to taste" })], [], []);
    expect(labels(withAmount)).toEqual(["spices: 1 tsp salt"]);
    const without = buildGroceryList([ing({ ...SALT, rawText: "Salt to taste" })], [], []);
    expect(labels(without)).toEqual(["spices: salt"]);
    expect(without.sections[0].lines[0]).toMatchObject({ key: "item:i-salt:count:each", shortfallBase: null });
  });

  it("lists unparsed lines under Other, merging identical text", () => {
    const list = buildGroceryList(
      [ing({ rawText: "For  the sauce:" }), ing({ rawText: "for the sauce:", recipeTitle: "Chili" })],
      [],
      [],
    );
    expect(labels(list)).toEqual(["other: For  the sauce:"]);
    expect(list.sections[0].lines[0]).toMatchObject({ key: rawKey("For the sauce:"), recipes: ["Chili", "Pancakes"] });
  });

  it("renders a checked line from its mark when inventory covers it", () => {
    const marks: GroceryMark[] = [{ key: "item:i-flour:volume", checked: true, checkedQty: 473.176, hidden: false }];
    const list = buildGroceryList([ing({ ...FLOUR, quantity: 2, unit: "cup" })], marks, [], { inventory: [stock("i-flour", "volume", 473.176)] });
    expect(labels(list)).toEqual(["pantry: ✓ 2 cups flour"]);
    // Same id as the need line it replaces, so the row (and keyboard focus) survives the re-render.
    expect(list.sections[0].lines[0]).toMatchObject({ kind: "bought", id: "item:i-flour:volume" });
    expect(list).toMatchObject({ toBuy: 0, checked: 1 });
  });

  it("shows a bought line and the remainder when the plan grows", () => {
    const marks: GroceryMark[] = [{ key: "item:i-flour:volume", checked: true, checkedQty: 473.176, hidden: false }];
    const list = buildGroceryList([ing({ ...FLOUR, quantity: 3, unit: "cup" })], marks, [], { inventory: [stock("i-flour", "volume", 473.176)] });
    expect(labels(list)).toEqual(["pantry: 1 cup flour", "pantry: ✓ 2 cups flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ kind: "need", id: "item:i-flour:volume#more", shortfallBase: expect.closeTo(236.588, 2) });
    expect(list.sections[0].lines[1]).toMatchObject({ kind: "bought", id: "item:i-flour:volume" });
  });

  it("checks an amount-less line with no quantity", () => {
    const marks: GroceryMark[] = [{ key: "item:i-salt:count:each", checked: true, checkedQty: null, hidden: false }];
    expect(labels(buildGroceryList([ing({ ...SALT, rawText: "Salt to taste" })], marks, []))).toEqual(["spices: ✓ salt"]);
  });

  it("hides lines for the week and counts them, unless asked to show them", () => {
    const marks: GroceryMark[] = [{ key: "item:i-flour:volume", checked: false, checkedQty: null, hidden: true }];
    const ings = [ing({ ...FLOUR, quantity: 2, unit: "cup" }), ing({ ...MILK, quantity: 1, unit: "cup" })];
    const hidden = buildGroceryList(ings, marks, []);
    expect(labels(hidden)).toEqual(["dairy & eggs: 1 cup milk"]);
    expect(hidden.hiddenCount).toBe(1);
    const shown = buildGroceryList(ings, marks, [], { showHidden: true });
    expect(shown.sections.flatMap((s) => s.lines).find((l) => l.name === "flour")).toMatchObject({ hidden: true });
  });

  it("subtracts what's on hand and leaves out lines you already have", () => {
    const ings = [ing({ ...FLOUR, quantity: 3, unit: "cup" }), ing({ ...MILK, quantity: 1, unit: "cup" })];
    const list = buildGroceryList(ings, [], [], { inventory: [stock("i-flour", "volume", 473.176), stock("i-milk", "volume", 500)] });
    expect(labels(list)).toEqual(["pantry: 1 cup flour"]);
  });

  it("never subtracts across unit kinds, and says what you have", () => {
    const list = buildGroceryList([ing({ ...FLOUR, itemUnitKind: "weight", quantity: 200, unit: "g" })], [], [], {
      inventory: [stock("i-flour", "volume", 473.176)],
    });
    expect(labels(list)).toEqual(["pantry: 200 g flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ hint: "you have 2 cups", dimmed: false });
  });

  it("marks an amount-less line 'have some' when the item is in stock", () => {
    const list = buildGroceryList([ing({ ...SALT, rawText: "Salt to taste" })], [], [], { inventory: [stock("i-salt", "volume", 5)] });
    expect(labels(list)).toEqual(["spices: salt"]);
    expect(list.sections[0].lines[0]).toMatchObject({ hint: "have some", dimmed: true, checked: false });
  });

  it("carries the display system on need lines", () => {
    const list = buildGroceryList([ing({ ...FLOUR, itemUnitKind: "weight", quantity: 200, unit: "g" })], [], []);
    expect(list.sections[0].lines[0]).toMatchObject({ system: "metric", hint: null, dimmed: false });
  });

  it("adds extras to their section and orders unchecked lines first", () => {
    const extras: GroceryExtra[] = [
      { id: "e1", name: "paper towels", quantity: null, unit: null, section: null, checked: false },
      { id: "e2", name: "apples", quantity: 2, unit: "lb", section: "produce", checked: true },
      { id: "e3", name: "bananas", quantity: 6, unit: null, section: "produce", checked: false },
    ];
    const list = buildGroceryList([ing({ ...TOMATO, quantity: 3 })], [], extras);
    expect(labels(list)).toEqual(["produce: 6 bananas", "produce: 3 tomatoes", "produce: ✓ 2 lb apples", "other: paper towels"]);
    expect(list.sections[0].lines.find((l) => l.name === "apples")).toMatchObject({ kind: "extra", key: "extra:e2", extraId: "e2" });
    expect(list).toMatchObject({ toBuy: 3, checked: 1 });
  });

  it("returns no sections for an empty week", () => {
    expect(buildGroceryList([], [], [])).toEqual({ sections: [], toBuy: 0, checked: 0, hiddenCount: 0 });
  });
});

describe("parseLineKey", () => {
  it("splits item keys and rejects others", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseLineKey(`item:${id}:count:can`)).toEqual({ itemId: id, unitKey: "count:can" });
    expect(parseLineKey(`item:${id}:volume`)).toEqual({ itemId: id, unitKey: "volume" });
    expect(parseLineKey("raw:for the sauce:")).toBeNull();
    expect(parseLineKey("item:not-an-id:volume")).toBeNull();
  });
});
