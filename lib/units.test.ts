import { describe, expect, it } from "vitest";
import { formatAmount, formatQuantity, matchUnit, toBase, unitKeyForKind, unitKind, unitLabel } from "./units";

describe("matchUnit", () => {
  it.each([
    [["cups", "flour"], "cup", 1],
    [["Tablespoons", "butter"], "tbsp", 1],
    [["T", "oil"], "tbsp", 1],
    [["t", "salt"], "tsp", 1],
    [["tsp.", "salt"], "tsp", 1],
    [["fl", "oz", "cream"], "fl oz", 2],
    [["fluid", "ounces", "milk"], "fl oz", 2],
    [["g", "sugar"], "g", 1],
    [["lbs", "beef"], "lb", 1],
    [["cloves", "garlic"], "clove", 1],
    [["cans", "tomatoes"], "can", 1],
    [["bags", "potatoes"], "bag", 1],
    [["bottles", "beer"], "bottle", 1],
    [["box", "pasta"], "box", 1],
  ] as const)("reads %j as %s", (tokens, unit, consumed) => {
    expect(matchUnit([...tokens])).toEqual({ unit, consumed });
  });

  it("returns null when the first token is not a unit", () => {
    expect(matchUnit(["large", "eggs"])).toBeNull();
    expect(matchUnit([])).toBeNull();
  });
});

describe("unitKind", () => {
  it("classifies units", () => {
    expect(unitKind("cup")).toBe("volume");
    expect(unitKind("fl oz")).toBe("volume");
    expect(unitKind("g")).toBe("weight");
    expect(unitKind("lb")).toBe("weight");
    expect(unitKind("clove")).toBe("count");
    expect(unitKind("mystery")).toBe("count");
  });
});

describe("unitLabel", () => {
  it("pluralizes words but not abbreviations", () => {
    expect(unitLabel("cup", 1)).toBe("cup");
    expect(unitLabel("cup", 2)).toBe("cups");
    expect(unitLabel("cup", 0.5)).toBe("cup");
    expect(unitLabel("pinch", 2)).toBe("pinches");
    expect(unitLabel("clove", 3)).toBe("cloves");
    expect(unitLabel("tbsp", 3)).toBe("tbsp");
    expect(unitLabel("fl oz", 2)).toBe("fl oz");
    expect(unitLabel("cup", 1.0000000001)).toBe("cup");
    expect(unitLabel("cup", 1.01)).toBe("cup");
    expect(unitLabel("box", 2)).toBe("boxes");
    expect(unitLabel("bag", 2)).toBe("bags");
  });
});

describe("formatQuantity", () => {
  it.each([
    [1, "1"],
    [0.5, "½"],
    [1.5, "1 ½"],
    [2 / 3, "⅔"],
    [1 + 1 / 3, "1 ⅓"],
    [2.25, "2 ¼"],
    [0.375, "⅜"],
    [0.99, "1"],
    [0.3, "0.3"],
    [10.1, "10.1"],
    [0.01, "0.01"],
    [0, "0"],
    [(1 + 1 / 3) * 1.5, "2"],
  ])("formats %d as %s", (n, expected) => {
    expect(formatQuantity(n)).toBe(expected);
  });
});

describe("toBase", () => {
  it("converts volume and weight to ml and g, keeping count units apart", () => {
    expect(toBase(2, "cup")).toEqual({ unitKey: "volume", amount: expect.closeTo(473.176, 3), system: "us" });
    expect(toBase(200, "g")).toEqual({ unitKey: "weight", amount: 200, system: "metric" });
    expect(toBase(1, "lb")).toEqual({ unitKey: "weight", amount: expect.closeTo(453.592, 3), system: "us" });
    expect(toBase(2, "can")).toEqual({ unitKey: "count:can", amount: 2, system: null });
    expect(toBase(3, null)).toEqual({ unitKey: "count:each", amount: 3, system: null });
  });

  it("maps a unit kind to its key", () => {
    expect(unitKeyForKind("volume")).toBe("volume");
    expect(unitKeyForKind("weight")).toBe("weight");
    expect(unitKeyForKind("count")).toBe("count:each");
  });
});

describe("formatAmount", () => {
  it.each([
    ["volume", 236.588, "us", "1 cup"],
    ["volume", 354.882, "us", "1 ½ cups"],
    ["volume", 3 * 4.92892, "us", "1 tbsp"],
    ["volume", 4.92892 / 2, "us", "½ tsp"],
    ["volume", 2 * 14.7868, "us", "2 tbsp"],
    ["volume", 750, "metric", "750 ml"],
    ["volume", 1500, "metric", "1.5 l"],
    ["volume", 2.5, "metric", "2.5 ml"],
    ["weight", 653.592, "metric", "654 g"],
    ["weight", 2 * 28.3495, "us", "2 oz"],
    ["weight", 907.184, "us", "2 lb"],
    ["weight", 1250, "metric", "1.25 kg"],
    ["count:each", 3, null, "3"],
    ["count:can", 2, null, "2 cans"],
    ["count:clove", 1.5, null, "1 ½ cloves"],
  ] as const)("formats %s %d (%s) as %j", (unitKey, amount, system, expected) => {
    expect(formatAmount(unitKey, amount, system)).toBe(expected);
  });
});
