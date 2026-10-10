import { describe, expect, it } from "vitest";
import { amountForKey, planDeductions, splitStockKey, stockKey, stockMap } from "./inventory";

const FLOUR = "11111111-1111-4111-8111-111111111111";
const EGG = "22222222-2222-4222-8222-222222222222";

describe("stock keys", () => {
  it("joins and splits item and unit key", () => {
    expect(stockKey(FLOUR, "volume")).toBe(`${FLOUR}|volume`);
    expect(splitStockKey(`${FLOUR}|count:can`)).toEqual({ itemId: FLOUR, unitKey: "count:can" });
    expect(splitStockKey("nonsense")).toBeNull();
  });

  it("sums entries by key", () => {
    const map = stockMap([
      { itemId: FLOUR, unitKey: "volume", quantity: 100, system: "us" },
      { itemId: FLOUR, unitKey: "volume", quantity: 50, system: null },
      { itemId: FLOUR, unitKey: "weight", quantity: 200, system: "metric" },
    ]);
    expect(map.get(stockKey(FLOUR, "volume"))).toBe(150);
    expect(map.get(stockKey(FLOUR, "weight"))).toBe(200);
  });
});

describe("planDeductions", () => {
  const stock = new Map([
    [stockKey(FLOUR, "volume"), 300],
    [stockKey(EGG, "count:each"), 1],
  ]);

  it("takes the scaled amount, capped by what's on hand", () => {
    const deductions = planDeductions(
      [
        { itemId: FLOUR, quantity: 1, unit: "cup" },
        { itemId: EGG, quantity: 2, unit: null },
      ],
      0.5,
      stock,
    );
    expect(deductions[stockKey(FLOUR, "volume")]).toBeCloseTo(118.294, 2);
    expect(deductions[stockKey(EGG, "count:each")]).toBe(1);
  });

  it("merges lines for the same key before capping", () => {
    const deductions = planDeductions(
      [
        { itemId: FLOUR, quantity: 1, unit: "cup" },
        { itemId: FLOUR, quantity: 1, unit: "cup" },
      ],
      1,
      stock,
    );
    expect(deductions[stockKey(FLOUR, "volume")]).toBe(300);
  });

  it("skips lines without an item, an amount, or matching stock", () => {
    expect(
      planDeductions(
        [
          { itemId: null, quantity: 1, unit: "cup" },
          { itemId: FLOUR, quantity: null, unit: null },
          { itemId: FLOUR, quantity: 100, unit: "g" },
        ],
        1,
        stock,
      ),
    ).toEqual({});
  });
});

describe("amountForKey", () => {
  it.each([
    ["3 cups", "volume", 709.764],
    ["500 ml", "volume", 500],
    ["1 lb", "weight", 453.592],
    ["2", "count:each", 2],
    ["2", "count:can", 2],
    ["3 cans", "count:can", 3],
    ["3 cloves", "count:clove", 3],
    ["1 ½ cups", "volume", 354.882],
  ])("reads %j for %s", (text, unitKey, amount) => {
    expect(amountForKey(text, unitKey)?.amount).toBeCloseTo(amount, 2);
  });

  it.each([
    ["500 g", "volume"],
    ["2 cups", "weight"],
    ["2", "volume"],
    ["some", "volume"],
    ["2 cups flour", "volume"],
    ["0", "count:each"],
    ["", "volume"],
  ])("rejects %j for %s", (text, unitKey) => {
    expect(amountForKey(text, unitKey)).toBeNull();
  });

  it("reports the unit system", () => {
    expect(amountForKey("500 g", "weight")?.system).toBe("metric");
    expect(amountForKey("2 cups", "volume")?.system).toBe("us");
  });
});
