import { describe, expect, it } from "vitest";
import { formatQuantity, matchUnit, unitKind, unitLabel } from "./units";

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
