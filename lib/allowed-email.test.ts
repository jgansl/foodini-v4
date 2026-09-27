import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./allowed-email";

describe("isAllowedEmail", () => {
  it("matches case-insensitively and ignores spaces", () => {
    expect(isAllowedEmail("Me@Example.com", " me@example.com , other@example.com")).toBe(true);
    expect(isAllowedEmail("other@example.com", "me@example.com,other@example.com")).toBe(true);
  });
  it("rejects addresses not on the list", () => {
    expect(isAllowedEmail("stranger@example.com", "me@example.com")).toBe(false);
  });
  it("rejects everyone when the list is missing or empty", () => {
    expect(isAllowedEmail("me@example.com", undefined)).toBe(false);
    expect(isAllowedEmail("me@example.com", " , ")).toBe(false);
  });
});
