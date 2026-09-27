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
  it("allows a whole domain with an @domain entry", () => {
    expect(isAllowedEmail("e2e-123@example.test", "me@example.com, @example.test")).toBe(true);
    expect(isAllowedEmail("someone@notexample.test", "@example.test")).toBe(false);
    expect(isAllowedEmail("someone@example.test.evil.com", "@example.test")).toBe(false);
  });
  it("rejects everyone when the list is missing or empty", () => {
    expect(isAllowedEmail("me@example.com", undefined)).toBe(false);
    expect(isAllowedEmail("me@example.com", " , ")).toBe(false);
  });
});
