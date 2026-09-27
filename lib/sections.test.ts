import { describe, expect, it } from "vitest";
import { sectionFor } from "./sections";

describe("sectionFor", () => {
  it.each([
    ["flour", "pantry"],
    ["all-purpose flour", "pantry"],
    ["green beans", "produce"],
    ["black beans", "pantry"],
    ["chicken broth", "pantry"],
    ["chicken thighs", "meat & seafood"],
    ["frozen peas", "frozen"],
    ["ground cumin", "spices"],
    ["ground beef", "meat & seafood"],
    ["garlic powder", "spices"],
    ["garlic", "produce"],
    ["eggplant", "produce"],
    ["eggs", "dairy & eggs"],
    ["peanut butter", "pantry"],
    ["salted butter", "dairy & eggs"],
    ["red pepper flakes", "spices"],
    ["baguette", "bakery"],
    ["dry white wine", "beverages"],
    ["bay leaves", "spices"],
    ["whole cloves", "spices"],
    ["garlic cloves", "produce"],
    ["molasses", "pantry"],
    ["mystery ingredient", "other"],
  ])("puts %j in %s", (name, section) => {
    expect(sectionFor(name)).toBe(section);
  });
});
