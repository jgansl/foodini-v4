import { describe, expect, it } from "vitest";
import { addDays, formatDay, formatWeekRange, isIsoDate, mondayOf, resolveWeek, todayIn, weekDays } from "./dates";

describe("isIsoDate", () => {
  it.each([
    ["2026-09-28", true],
    ["2028-02-29", true],
    ["2026-02-29", false],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["2026-9-1", false],
    ["junk", false],
    ["", false],
  ])("%j → %s", (s, expected) => {
    expect(isIsoDate(s)).toBe(expected);
  });
});

describe("date math", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the Monday of any day", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
  });

  it("lists the seven days of a week", () => {
    expect(weekDays("2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  });
});

describe("todayIn", () => {
  const instant = new Date("2026-09-28T05:30:00Z");

  it("uses the given time zone's calendar date", () => {
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-09-27");
    expect(todayIn("Asia/Tokyo", instant)).toBe("2026-09-28");
  });

  it("falls back to UTC for a missing or invalid time zone", () => {
    expect(todayIn(undefined, instant)).toBe("2026-09-28");
    expect(todayIn("Not/AZone", instant)).toBe("2026-09-28");
  });
});

describe("resolveWeek", () => {
  it("normalizes a valid date to its Monday", () => {
    expect(resolveWeek("2026-10-01", "2026-09-27")).toBe("2026-09-28");
  });

  it.each([undefined, "", "junk", "2026-02-30", "2026-13-01"])("uses today's week for %j", (param) => {
    expect(resolveWeek(param, "2026-09-27")).toBe("2026-09-21");
  });
});

describe("labels", () => {
  it("formats a day and a week range", () => {
    expect(formatDay("2026-09-28")).toBe("Mon, Sep 28");
    expect(formatWeekRange("2026-09-28")).toBe("Sep 28 – Oct 4");
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28 – Jan 3");
  });
});
