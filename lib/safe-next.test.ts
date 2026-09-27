import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths with query strings", () => {
    expect(safeNext("/recipes?tag=soup")).toBe("/recipes?tag=soup");
    expect(safeNext("/recipes/abc/edit")).toBe("/recipes/abc/edit");
  });
  it.each([null, undefined, "", "recipes", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/%2F%2Fevil.example"])(
    "falls back for %j",
    (next) => {
      expect(safeNext(next)).toBe("/recipes");
    },
  );
  it("uses a custom fallback", () => {
    expect(safeNext(null, "/plan")).toBe("/plan");
  });
});
