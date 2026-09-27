# Phase 2: Meal Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan a week of meals. On `/plan`, move between Monday–Sunday weeks, add any number of recipes to a day (each with its own servings and optional label), reorder or move them, edit them, mark them cooked, and remove them. Recipe pages get "Add to plan", and deleting a planned recipe asks first. This phase also fixes the three ★ parser backlog items that phase 3 depends on.

**Architecture:** One new table, `plan_entries`, with the same two-layer access control as phase 1: query helpers filter by `user_id`, and row-level security protects the Supabase Data API. Here RLS also checks that the recipe belongs to the same user. Dates are plain `YYYY-MM-DD` strings. "Today" is computed in the user's own time zone, which the browser saves in a `tz` cookie. Pure logic (date math, form validation, the parser fixes) lives in `lib/` with unit tests. Plan changes are plain Server Action forms that re-render the page.

**Tech Stack:** Same as phase 1: Next.js 16.3, React 19.2, Supabase, Drizzle 0.45, Zod 4, Vitest 5, Playwright 1.63. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-27-foodini-meal-planner-design.md`. Phase 2 covers §3 (`plan_entries`, and blocking deletion of a planned recipe), §4 (`/plan`, "Add to plan" on `/recipes/[id]`, the Plan tab) and the past-entry nudge from §5 step 1. Phase 1's plan (`2026-09-27-phase-1-foundation-and-recipes.md`) shows the conventions this plan follows.

## Global Constraints

- All of phase 1's Global Constraints still apply, in particular:
  - Next 16 conventions: `proxy.ts`, Promise `params` and `searchParams`, `PageProps<'/route'>`, and `error.tsx` receives `retry`.
  - No `use cache`.
  - `requireUser()` in every action.
  - `userId` filtering in every query helper.
  - `pnpm`, and the commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **After adding a route, run `pnpm exec next typegen`** before `tsc`, so `PageProps<"/plan">` exists.
- **Dates:** `plan_entries.date` is a Postgres `date`, read and written as a `YYYY-MM-DD` string. Never convert to a `Date` in a server's local time zone. Use the helpers in `lib/dates.ts`, which do all their math in UTC on calendar dates.
- **Weeks** run Monday–Sunday. Any `?week=` value is normalized to its Monday. A missing or invalid value means the week containing today.
- **Today** is calculated in the user's time zone from the `tz` cookie (an IANA name, set by the browser). A missing or invalid time zone falls back to UTC.
- **Servings on a plan entry:** at least 0.5, at most 100, in steps of 0.5. When left blank, it defaults to the recipe's servings.
- **Labels:** optional, at most 40 characters, trimmed; blank means none.
- **Deleting a planned recipe is blocked in two places:**
  - The database: the foreign key from `plan_entries.recipe_id` is `NO ACTION`. It behaves like `RESTRICT` for a direct delete, but lets a deleted user's rows cascade in any order.
  - The app: `deleteRecipe` returns `{ status: "planned", count }` unless it's called with `removePlanEntries: true`. The UI then confirms with the count.
- **Marking a meal cooked** only sets `cooked_at` in phase 2. Deducting inventory and filling the `deducted` column are phase 4; the column is created now so phase 4 needs no migration.
- **Plan changes use plain Server Action forms** that re-render. `useOptimistic` (spec §2) is deferred to phase 3's check-offs, where speed matters most. Record this in DECISIONS.md (Task 9).
- **AGENTS.md rules:**
  - Log anything deferred in `docs/ROADMAP.md` → Backlog.
  - Remove fixed backlog lines and note them in `docs/CHANGELOG.md`.
  - Run `pnpm licenses list --prod` before the PR. It should show no change.

## Review Focus

1. **Time zone at midnight:** "today" and the default week must follow the user's time zone, not the server's. At 23:30 on a Sunday in Los Angeles, the server's UTC clock already says Monday. Tests: Task 2 `todayIn` cases; Task 8 e2e runs with `timezoneId: "America/Los_Angeles"`.
2. **A bad `?week=` value** (`junk`, `2026-02-30`, `2026-13-01`) must show the current week, not a 500 error. Tests: Task 2 `resolveWeek`; Task 8 e2e `a bad week in the URL shows this week`.
3. **A forged form that plans another user's recipe** (or a non-UUID) must be refused. Tests: Task 5 `refuses a recipe the user doesn't own`; Task 4 RLS test `refuses plan entries that point at another user's recipe`.
4. **Deleting a planned recipe** must ask with the count, and never produce a foreign-key 500. Tests: Task 5 `blocks deleting a planned recipe unless asked to remove its plan entries`; Task 8 e2e `deleting a planned recipe says how many meals it removes`.
5. **Moving the first entry up, or the last entry down,** is a harmless no-op. The buttons are disabled, but a forged request must not error. Test: Task 5 `reorders within a day and ignores moves past the ends`.

---

## File Structure

```
lib/
  ingredients.ts, sections.ts   (modify) ★ parser fixes
  dates.ts (+ .test.ts)         ISO calendar-date math, today in a time zone, week resolution, labels
  plan-input.ts (+ .test.ts)    Zod parsing for "add entry" and "edit entry" forms
db/
  schema.ts                     (modify) plan_entries
  migrations/0002_*.sql, 0003_plan_entries_rls.sql
  queries/plan.ts               list/add/update/move/cook/remove/count
  queries/recipes.ts            (modify) deleteRecipe with planned-entry handling
server/today.ts                 getToday(): today in the tz-cookie time zone
components/
  timezone-cookie.tsx           client: writes the tz cookie, refreshes once
  confirm-form.tsx              client: form that asks window.confirm before submitting
  app-nav.tsx                   (modify) Plan tab
app/(app)/
  layout.tsx                    (modify) render <TimezoneCookie />
  plan/page.tsx                 week view
  plan/actions.ts               plan Server Actions
  plan/add-entry-form.tsx       client: add to a day or from a recipe
  plan/entry-card.tsx           one planned meal with its controls
  plan/entry-editor.tsx         client: servings and label form
  plan/error.tsx
  recipes/actions.ts            (modify) deleteRecipeAction(recipeId, removePlanned)
  recipes/[id]/page.tsx         (modify) Add to plan, planned count, delete message
  recipes/[id]/delete-button.tsx (modify) message with planned count
tests/
  integration/plan.test.ts, rls.test.ts (modify), recipes.test.ts (modify)
  e2e/plan.spec.ts, e2e/helpers.ts (modify)
docs/ ROADMAP.md, CHANGELOG.md, DECISIONS.md (modify)
```

---

### Task 1: ★ Parser fixes

Fixes the three ★ backlog items: container sizes ("2 14-ounce cans chickpeas", "1 x 400g tin tomatoes"), irregular plurals ("bay leaves", "molasses"), and a count unit with no item ("2 cloves").

**Files:**
- Modify: `lib/ingredients.ts`, `lib/ingredients.test.ts`, `lib/sections.ts`, `lib/sections.test.ts`

**Interfaces:**
- Consumes: `matchUnit`, `unitKind`, `formatQuantity`, `unitLabel` from `lib/units.ts`
- Produces: same exports as before (`parseIngredient`, `formatIngredient`, `normalizeItemName`, `sectionFor`), with new behavior

**Existing data:** the item keys for "bay leaves" and "molasses" change. No deployed data exists. In a local database, run `pnpm exec supabase db reset && pnpm db:migrate` if old items matter.

- [ ] **Step 1: Write the failing tests**

In `lib/ingredients.test.ts`, add these rows to the `parseIngredient` `it.each` table, just before the `"8 oz"` row:

```ts
    ["2 14-ounce cans chickpeas", { quantity: 2, unit: "can", name: "chickpeas", note: "14-ounce" }],
    ["1 28oz can crushed tomatoes, undrained", { quantity: 1, unit: "can", name: "crushed tomatoes", note: "28oz, undrained" }],
    ["1 x 400g tin tomatoes", { quantity: 1, unit: "can", name: "tomatoes", note: "400g" }],
    ["2 cloves", { quantity: 2, unit: null, name: "cloves", note: null }],
    ["3 whole cloves", { quantity: 3, unit: null, name: "whole cloves", note: null }],
```

Add these rows to the `normalizeItemName` `it.each` table:

```ts
    ["bay leaves", "bay leaf"],
    ["loaves", "loaf"],
    ["halves", "half"],
    ["olives", "olive"],
    ["cloves", "clove"],
    ["molasses", "molasses"],
    ["couscous", "couscous"],
    ["asparagus", "asparagus"],
```

In `lib/sections.test.ts`, add to the table:

```ts
    ["bay leaves", "spices"],
    ["whole cloves", "spices"],
    ["garlic cloves", "produce"],
    ["molasses", "pantry"],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/ingredients.test.ts lib/sections.test.ts`
Expected: FAIL. The new container rows, "2 cloves", "bay leaves", "loaves", "halves", "molasses", and the "whole cloves", "garlic cloves" and "molasses" sections all fail. The existing rows still pass.

- [ ] **Step 3: Implement the parser changes in `lib/ingredients.ts`**

Change the units import to:

```ts
import { formatQuantity, matchUnit, unitKind, unitLabel } from "./units";
```

Add below `SIZE_WORDS`:

```ts
// A package size before a container unit: "14-ounce cans", "400g tin", "28 oz can".
const CONTAINER_SIZE = /^(\d+(?:\.\d+)?\s?-?\s?(?:ounces?|oz|grams?|g|kg|ml|l|lbs?|pounds?))\.?\s+(?=\S)/i;
```

In `parseIngredient`, replace the whole block from `let unit: string | null = null;` down to and including `rest = rest.replace(/^of\s+/i, "");` with:

```ts
  let unit: string | null = null;
  let unitWord: string | null = null;
  let containerNote: string | null = null;
  if (quantity !== null) {
    rest = rest.replace(/^x\s+/i, "");
    const size = CONTAINER_SIZE.exec(rest);
    if (size) {
      const tokens = rest.slice(size[0].length).split(" ");
      const container = matchUnit(tokens);
      if (container && unitKind(container.unit) === "count") {
        containerNote = size[1].replace(/\s+/g, "");
        unit = container.unit;
        unitWord = tokens.slice(0, container.consumed).join(" ");
        rest = tokens.slice(container.consumed).join(" ");
      }
    }
    if (unit === null) {
      const tokens = rest.split(" ");
      const match = matchUnit(tokens);
      if (match) {
        unit = match.unit;
        unitWord = tokens.slice(0, match.consumed).join(" ");
        rest = tokens.slice(match.consumed).join(" ");
      }
    }
  }
  rest = rest.replace(/^of\s+/i, "");
```

Replace the final three statements of `parseIngredient` (from `const name = words.join(" ").toLowerCase() || null;` to the `return`) with:

```ts
  let name = words.join(" ").toLowerCase() || null;
  // "2 cloves" means the spice, not two cloves of something: a count unit with nothing after it is the item.
  if (name === null && unit !== null && unitWord !== null && unitKind(unit) === "count") {
    name = unitWord.toLowerCase();
    unit = null;
  }
  const notes = [containerNote, sizeNote, ...parenNotes, commaNote, ...trailingNotes].filter((n): n is string => Boolean(n));
  return { raw: text, quantity, unit, name, note: notes.length ? notes.join(", ") : null };
```

Replace `singularize` with:

```ts
// Words that end in "s" but are already singular.
const INVARIANT = new Set(["molasses", "couscous", "hummus", "asparagus", "citrus", "swiss", "grits", "series", "species"]);

function singularize(word: string): string {
  if (word.length <= 3 || INVARIANT.has(word)) return word;
  if (/(eaves|oaves|alves)$/.test(word)) return `${word.slice(0, -3)}f`;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|oes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}
```

- [ ] **Step 4: Update the section keywords in `lib/sections.ts`**

In the `spices` list, add `"clove"` after `"allspice"`. In the `pantry` list, add `"molasses"` after `"syrup"`. In the `produce` list, add `"garlic clove"` after `"garlic"`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, the whole unit suite, including every existing parser and section case.

- [ ] **Step 6: Commit**

```bash
git add lib/ingredients.ts lib/ingredients.test.ts lib/sections.ts lib/sections.test.ts
git commit -m "Parse container sizes, irregular plurals and bare count units" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Calendar-date helpers

**Files:**
- Create: `lib/dates.ts`, `lib/dates.test.ts`

**Interfaces:**
- Produces:
  - `isIsoDate(s: string): boolean`
  - `addDays(iso: string, days: number): string`
  - `mondayOf(iso: string): string`
  - `weekDays(weekStart: string): string[]` (7 dates)
  - `todayIn(timeZone: string | undefined, now?: Date): string`
  - `resolveWeek(param: string | undefined, today: string): string`
  - `formatDay(iso: string): string` ("Mon, Sep 28")
  - `formatWeekRange(weekStart: string): string` ("Sep 28 – Oct 4")

- [ ] **Step 1: Write the failing tests**

`lib/dates.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/dates.test.ts`
Expected: FAIL, "Cannot find module './dates'".

- [ ] **Step 3: Implement `lib/dates.ts`**

```ts
// Calendar dates as "YYYY-MM-DD" strings. All math happens in UTC so a server's own time zone
// never shifts a date.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  const match = ISO_DATE.exec(s);
  if (!match) return false;
  const date = toUtc(s);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

export function mondayOf(iso: string): string {
  const daysSinceMonday = (toUtc(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -daysSinceMonday);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Today's calendar date in `timeZone` (an IANA name); UTC when missing or invalid. */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return fromUtc(now);
  }
}

/** The Monday of `param`'s week, or of today's week when `param` is missing or invalid. */
export function resolveWeek(param: string | undefined, today: string): string {
  return param && isIsoDate(param) ? mondayOf(param) : mondayOf(today);
}

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const monthDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export function formatDay(iso: string): string {
  return dayFormat.format(toUtc(iso));
}

export function formatWeekRange(weekStart: string): string {
  return `${monthDayFormat.format(toUtc(weekStart))} – ${monthDayFormat.format(toUtc(addDays(weekStart, 6)))}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts
git commit -m "Add calendar-date helpers for weekly plans" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plan form validation

**Files:**
- Create: `lib/plan-input.ts`, `lib/plan-input.test.ts`

**Interfaces:**
- Consumes: `isIsoDate` from `lib/dates.ts`
- Produces:
  - `type PlanEntryInput = { recipeId: string; date: string; servings: number | null; label: string | null }` (`servings: null` means use the recipe's)
  - `type PlanEntryUpdate = { servings: number; label: string | null }`
  - `type PlanFieldErrors = Partial<Record<"recipeId" | "date" | "servings" | "label", string>>`
  - `parseAddEntry(fd: FormData): { ok: true; data: PlanEntryInput } | { ok: false; fieldErrors: PlanFieldErrors }`
  - `parseEntryUpdate(fd: FormData): { ok: true; data: PlanEntryUpdate } | { ok: false; fieldErrors: PlanFieldErrors }`

- [ ] **Step 1: Write the failing tests**

`lib/plan-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAddEntry, parseEntryUpdate } from "./plan-input";

const RECIPE = "3f0f06de-0fbf-4e77-87d2-5b0c4712972b";
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("parseAddEntry", () => {
  it("reads a full entry", () => {
    expect(parseAddEntry(form({ recipeId: RECIPE, date: "2026-09-28", servings: "2.5", label: "  Dinner " }))).toEqual({
      ok: true,
      data: { recipeId: RECIPE, date: "2026-09-28", servings: 2.5, label: "Dinner" },
    });
  });

  it("treats blank servings as the recipe's and a blank label as none", () => {
    expect(parseAddEntry(form({ recipeId: RECIPE, date: "2026-09-28", servings: " ", label: "" }))).toEqual({
      ok: true,
      data: { recipeId: RECIPE, date: "2026-09-28", servings: null, label: null },
    });
  });

  it.each([
    [{ recipeId: "" }, "recipeId", "Pick a recipe"],
    [{ recipeId: "not-a-uuid" }, "recipeId", "Pick a recipe"],
    [{ date: "2026-02-30" }, "date", "Pick a valid day"],
    [{ date: "" }, "date", "Pick a valid day"],
    [{ servings: "abc" }, "servings", "Servings must be a number"],
    [{ servings: "0" }, "servings", "Servings must be more than 0"],
    [{ servings: "101" }, "servings", "At most 100 servings"],
    [{ servings: "1.3" }, "servings", "Use whole or half servings"],
    [{ label: "x".repeat(41) }, "label", "Keep the label under 40 characters"],
  ])("rejects %j", (override, field, message) => {
    const fields = { recipeId: RECIPE, date: "2026-09-28", servings: "", label: "", ...override };
    expect(parseAddEntry(form(fields))).toEqual({ ok: false, fieldErrors: { [field]: message } });
  });
});

describe("parseEntryUpdate", () => {
  it("requires servings", () => {
    expect(parseEntryUpdate(form({ servings: "", label: "" }))).toEqual({ ok: false, fieldErrors: { servings: "Servings is required" } });
  });

  it("reads servings and label", () => {
    expect(parseEntryUpdate(form({ servings: "3", label: "Lunch" }))).toEqual({ ok: true, data: { servings: 3, label: "Lunch" } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/plan-input.test.ts`
Expected: FAIL, "Cannot find module './plan-input'".

- [ ] **Step 3: Implement `lib/plan-input.ts`**

```ts
import { z } from "zod";
import { isIsoDate } from "./dates";

export type PlanEntryInput = { recipeId: string; date: string; servings: number | null; label: string | null };
export type PlanEntryUpdate = { servings: number; label: string | null };
export type PlanFieldErrors = Partial<Record<"recipeId" | "date" | "servings" | "label", string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const servingsNumber = z.coerce
  .number<string>({ error: "Servings must be a number" })
  .positive("Servings must be more than 0")
  .max(100, "At most 100 servings")
  .refine((n) => Number.isInteger(n * 2), "Use whole or half servings");

const label = z
  .string()
  .trim()
  .max(40, "Keep the label under 40 characters")
  .transform((s) => s || null);

const addSchema = z.object({
  recipeId: z.string().regex(UUID, "Pick a recipe"),
  date: z.string().refine(isIsoDate, "Pick a valid day"),
  servings: z
    .string()
    .trim()
    .transform((s) => s || null)
    .pipe(servingsNumber.nullable()),
  label,
});

const updateSchema = z.object({
  servings: z.string().trim().min(1, "Servings is required").pipe(servingsNumber),
  label,
});

const read = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" ? value : "";
};

function firstErrors(error: z.ZodError): PlanFieldErrors {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  const errors: PlanFieldErrors = {};
  for (const [field, messages] of Object.entries(flat)) {
    if (messages?.[0]) errors[field as keyof PlanFieldErrors] = messages[0];
  }
  return errors;
}

export function parseAddEntry(fd: FormData): { ok: true; data: PlanEntryInput } | { ok: false; fieldErrors: PlanFieldErrors } {
  const result = addSchema.safeParse({ recipeId: read(fd, "recipeId"), date: read(fd, "date"), servings: read(fd, "servings"), label: read(fd, "label") });
  return result.success ? { ok: true, data: result.data } : { ok: false, fieldErrors: firstErrors(result.error) };
}

export function parseEntryUpdate(fd: FormData): { ok: true; data: PlanEntryUpdate } | { ok: false; fieldErrors: PlanFieldErrors } {
  const result = updateSchema.safeParse({ servings: read(fd, "servings"), label: read(fd, "label") });
  return result.success ? { ok: true, data: result.data } : { ok: false, fieldErrors: firstErrors(result.error) };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm test lib/plan-input.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, with no type errors. If `servingsNumber.nullable()` doesn't type-check inside `.pipe`, use `z.union([z.null(), servingsNumber])`, keep the same behavior, and ledger it.

- [ ] **Step 5: Commit**

```bash
git add lib/plan-input.ts lib/plan-input.test.ts
git commit -m "Add plan entry form validation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `plan_entries` table and row-level security

**Files:**
- Modify: `db/schema.ts`, `tests/integration/rls.test.ts`
- Create: `db/migrations/0002_<generated>.sql`, `db/migrations/0003_plan_entries_rls.sql`

**Interfaces:**
- Consumes: `recipes` from `db/schema.ts`
- Produces: the Drizzle table `planEntries`, with columns `id`, `userId`, `date` (string), `position`, `recipeId`, `servings` (number), `label`, `cookedAt`, and `deducted` (`Record<string, number> | null`)

**Prerequisite:** local Supabase is running (`pnpm exec supabase status`).

- [ ] **Step 1: Write the failing RLS tests**

In `tests/integration/rls.test.ts`, add inside the `describe` block, after "hides items from other users":

```ts
  it("hides plan entries from other users", async () => {
    const { error } = await aliceDb.from("plan_entries").insert({ user_id: alice.id, recipe_id: recipeId, date: "2026-09-28", position: 0, servings: 2 });
    expect(error).toBeNull();
    const { data } = await bobDb.from("plan_entries").select("id");
    expect(data).toEqual([]);
  });

  it("refuses plan entries that point at another user's recipe", async () => {
    const { error } = await bobDb.from("plan_entries").insert({ user_id: bob.id, recipe_id: recipeId, date: "2026-09-28", position: 0, servings: 1 });
    expect(error).not.toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int tests/integration/rls.test.ts`
Expected: FAIL. The first test errors because `relation "public.plan_entries" does not exist` (reported by PostgREST). The second "passes" for the same wrong reason, so check the first one's failure message.

- [ ] **Step 3: Add the table to `db/schema.ts`**

Change the `drizzle-orm/pg-core` import to include `date` and `jsonb`:

```ts
import { check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
```

Append:

```ts
export const planEntries = pgTable(
  "plan_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /** Calendar day, "YYYY-MM-DD". */
    date: date("date", { mode: "string" }).notNull(),
    position: integer("position").notNull(),
    // NO ACTION (the default) blocks deleting a planned recipe like RESTRICT, but is checked at the end of
    // the statement, so deleting a user cascades through recipes and plan entries in any order.
    recipeId: uuid("recipe_id").notNull().references(() => recipes.id),
    servings: numeric("servings", { mode: "number" }).notNull(),
    label: text("label"),
    cookedAt: timestamp("cooked_at", { withTimezone: true }),
    /** Phase 4: item id → amount taken from inventory when cooked. */
    deducted: jsonb("deducted").$type<Record<string, number>>(),
  },
  (t) => [
    index("plan_entries_user_date_idx").on(t.userId, t.date, t.position),
    index("plan_entries_recipe_idx").on(t.recipeId),
    check("plan_entries_servings_positive", sql`${t.servings} > 0`),
  ],
);
```

- [ ] **Step 4: Generate the table migration and write the RLS migration**

Run: `pnpm db:generate --name=plan_entries`
Expected: `db/migrations/0002_plan_entries.sql` with `CREATE TABLE "plan_entries"`, the recipe foreign key (`ON DELETE no action`), two indexes and the check.

Run: `pnpm exec drizzle-kit generate --custom --name=plan_entries_rls`, then replace the contents of `db/migrations/0003_plan_entries_rls.sql` with:

```sql
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON "plan_entries" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "plan_entries" TO authenticated;
--> statement-breakpoint
ALTER TABLE "plan_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Rows are the owner's, and may only point at the owner's own recipes.
CREATE POLICY "plan_entries_owner" ON "plan_entries" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid()))
  WITH CHECK (
    "user_id" = (select auth.uid())
    AND EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_id" AND r."user_id" = (select auth.uid()))
  );
```

Run: `pnpm db:migrate`
Expected: both migrations apply.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:int`
Expected: PASS (all RLS tests, including the two new ones, and the phase 1 recipe tests).

- [ ] **Step 6: Commit**

```bash
git add db tests/integration/rls.test.ts
git commit -m "Add plan_entries table with row-level security" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Plan queries and blocking deletion of planned recipes

**Files:**
- Create: `db/queries/plan.ts`, `tests/integration/plan.test.ts`
- Modify: `db/queries/recipes.ts` (`deleteRecipe`), `tests/integration/recipes.test.ts` (delete expectations)

**Interfaces:**
- Consumes:
  - `db`, `DbOrTx`, `sqlClient` from `@/db`
  - `planEntries`, `recipes` from `@/db/schema`
  - `addDays` from `@/lib/dates`
  - `PlanEntryInput`, `PlanEntryUpdate` from `@/lib/plan-input`
- Produces (in `@/db/queries/plan`):
  - `type PlanEntryView = { id: string; date: string; position: number; recipeId: string; recipeTitle: string; recipeServings: number; servings: number; label: string | null; cookedAt: Date | null }`
  - `listWeek(userId, weekStart): Promise<PlanEntryView[]>`, ordered by date, then position
  - `addPlanEntry(userId, input: PlanEntryInput): Promise<string | null>`, which returns null when the recipe isn't the user's
  - `updatePlanEntry(userId, id, update: PlanEntryUpdate): Promise<boolean>`
  - `movePlanEntry(userId, id, direction: "up" | "down"): Promise<boolean>`, false when already at that end
  - `movePlanEntryToDate(userId, id, date): Promise<boolean>`
  - `setPlanEntryCooked(userId, id, cooked: boolean): Promise<boolean>`
  - `removePlanEntry(userId, id): Promise<boolean>`
  - `countPlanned(userId, recipeId): Promise<number>`
- Changes (in `@/db/queries/recipes`):
  - `type DeleteRecipeResult = { status: "deleted"; imagePath: string | null } | { status: "planned"; count: number }`
  - `deleteRecipe(userId, id, opts?: { removePlanEntries?: boolean }): Promise<DeleteRecipeResult | null>`

- [ ] **Step 1: Write the failing integration tests**

In `tests/integration/recipes.test.ts`, change the "deletes a recipe and its ingredients" expectation from `toEqual({ imagePath: null })` to:

```ts
    expect(await deleteRecipe(u.id, id)).toEqual({ status: "deleted", imagePath: null });
```

Create `tests/integration/plan.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import {
  addPlanEntry,
  countPlanned,
  listWeek,
  movePlanEntry,
  movePlanEntryToDate,
  removePlanEntry,
  setPlanEntryCooked,
  updatePlanEntry,
} from "@/db/queries/plan";
import { createRecipe, deleteRecipe, getRecipe } from "@/db/queries/recipes";
import type { RecipeInput } from "@/lib/recipe-input";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

const WEEK = "2026-09-28";
const soup: RecipeInput = { title: "Soup", servings: 4, ingredients: ["1 onion"], steps: [], tags: [], sourceUrl: null, notes: null };

const users: TestUser[] = [];
async function newUser(): Promise<TestUser> {
  const user = await createTestUser();
  users.push(user);
  return user;
}

afterAll(async () => {
  await Promise.all(users.map((u) => deleteTestUser(u.id)));
  await sqlClient.end();
});

async function add(userId: string, recipeId: string, date = "2026-09-29", servings: number | null = null, label: string | null = null) {
  const id = await addPlanEntry(userId, { recipeId, date, servings, label });
  if (!id) throw new Error("addPlanEntry returned null");
  return id;
}

const order = async (userId: string) => (await listWeek(userId, WEEK)).map((e) => e.id);

describe("plan queries", () => {
  it("adds entries at the end of their day, defaulting servings to the recipe's", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, soup);
    await add(u.id, r, "2026-09-29", null, "Dinner");
    await add(u.id, r, "2026-09-29", 2);
    const week = await listWeek(u.id, WEEK);
    expect(week.map((e) => [e.date, e.position, e.recipeTitle, e.recipeServings, e.servings, e.label, e.cookedAt])).toEqual([
      ["2026-09-29", 0, "Soup", 4, 4, "Dinner", null],
      ["2026-09-29", 1, "Soup", 4, 2, null, null],
    ]);
  });

  it("lists only the requested Monday–Sunday week", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, soup);
    for (const date of ["2026-09-27", "2026-09-28", "2026-10-04", "2026-10-05"]) await add(u.id, r, date);
    expect((await listWeek(u.id, WEEK)).map((e) => e.date)).toEqual(["2026-09-28", "2026-10-04"]);
  });

  it("refuses a recipe the user doesn't own", async () => {
    const [owner, other] = await Promise.all([newUser(), newUser()]);
    const r = await createRecipe(owner.id, soup);
    expect(await addPlanEntry(other.id, { recipeId: r, date: WEEK, servings: null, label: null })).toBeNull();
    expect(await addPlanEntry(other.id, { recipeId: "not-a-uuid", date: WEEK, servings: null, label: null })).toBeNull();
    expect(await listWeek(other.id, WEEK)).toEqual([]);
  });

  it("reorders within a day and ignores moves past the ends", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, soup);
    const a = await add(u.id, r);
    const b = await add(u.id, r);
    const c = await add(u.id, r);
    expect(await movePlanEntry(u.id, c, "up")).toBe(true);
    expect(await order(u.id)).toEqual([a, c, b]);
    expect(await movePlanEntry(u.id, a, "up")).toBe(false);
    expect(await movePlanEntry(u.id, b, "down")).toBe(false);
    expect(await movePlanEntry(u.id, a, "down")).toBe(true);
    expect(await order(u.id)).toEqual([c, a, b]);
  });

  it("moves an entry to another day, placing it last", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, soup);
    const a = await add(u.id, r, "2026-09-29");
    const b = await add(u.id, r, "2026-09-30");
    expect(await movePlanEntryToDate(u.id, a, "2026-09-30")).toBe(true);
    const week = await listWeek(u.id, WEEK);
    expect(week.map((e) => [e.id, e.date])).toEqual([
      [b, "2026-09-30"],
      [a, "2026-09-30"],
    ]);
  });

  it("updates servings and label, and marks cooked and not cooked", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, soup);
    const a = await add(u.id, r);
    expect(await updatePlanEntry(u.id, a, { servings: 2.5, label: "Lunch" })).toBe(true);
    expect(await setPlanEntryCooked(u.id, a, true)).toBe(true);
    let [entry] = await listWeek(u.id, WEEK);
    expect(entry).toMatchObject({ servings: 2.5, label: "Lunch" });
    expect(entry.cookedAt).toBeInstanceOf(Date);
    expect(await setPlanEntryCooked(u.id, a, false)).toBe(true);
    [entry] = await listWeek(u.id, WEEK);
    expect(entry.cookedAt).toBeNull();
  });

  it("removes an entry and counts what's planned", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, soup);
    const a = await add(u.id, r);
    await add(u.id, r, "2026-10-10");
    expect(await countPlanned(u.id, r)).toBe(2);
    expect(await removePlanEntry(u.id, a)).toBe(true);
    expect(await countPlanned(u.id, r)).toBe(1);
  });

  it("never touches another user's entries", async () => {
    const [owner, other] = await Promise.all([newUser(), newUser()]);
    const r = await createRecipe(owner.id, soup);
    const a = await add(owner.id, r);
    expect(await updatePlanEntry(other.id, a, { servings: 1, label: null })).toBe(false);
    expect(await movePlanEntry(other.id, a, "down")).toBe(false);
    expect(await movePlanEntryToDate(other.id, a, "2026-09-30")).toBe(false);
    expect(await setPlanEntryCooked(other.id, a, true)).toBe(false);
    expect(await removePlanEntry(other.id, a)).toBe(false);
    expect(await countPlanned(other.id, r)).toBe(0);
    const [entry] = await listWeek(owner.id, WEEK);
    expect(entry).toMatchObject({ id: a, servings: 4, cookedAt: null });
  });

  it("returns false or null for ids that are not UUIDs", async () => {
    const u = await newUser();
    expect(await updatePlanEntry(u.id, "nope", { servings: 1, label: null })).toBe(false);
    expect(await movePlanEntry(u.id, "nope", "up")).toBe(false);
    expect(await movePlanEntryToDate(u.id, "nope", WEEK)).toBe(false);
    expect(await setPlanEntryCooked(u.id, "nope", true)).toBe(false);
    expect(await removePlanEntry(u.id, "nope")).toBe(false);
    expect(await countPlanned(u.id, "nope")).toBe(0);
  });

  it("blocks deleting a planned recipe unless asked to remove its plan entries", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, soup);
    await add(u.id, r);
    await add(u.id, r, "2026-10-01");
    expect(await deleteRecipe(u.id, r)).toEqual({ status: "planned", count: 2 });
    expect(await getRecipe(u.id, r)).not.toBeNull();
    expect(await deleteRecipe(u.id, r, { removePlanEntries: true })).toEqual({ status: "deleted", imagePath: null });
    expect(await getRecipe(u.id, r)).toBeNull();
    expect(await listWeek(u.id, WEEK)).toEqual([]);
  });

  it("lets a user with planned meals be deleted", async () => {
    const u = await createTestUser();
    const r = await createRecipe(u.id, soup);
    await add(u.id, r);
    await expect(deleteTestUser(u.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int`
Expected: FAIL. `plan.test.ts` can't resolve `@/db/queries/plan`, and the updated `recipes.test.ts` expectation fails (it receives `{ imagePath: null }`).

- [ ] **Step 3: Implement `db/queries/plan.ts`**

```ts
import "server-only";
import { and, asc, count, desc, eq, gt, gte, lt, lte, max } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { planEntries, recipes } from "@/db/schema";
import { addDays } from "@/lib/dates";
import type { PlanEntryInput, PlanEntryUpdate } from "@/lib/plan-input";

export type PlanEntryView = {
  id: string;
  date: string;
  position: number;
  recipeId: string;
  recipeTitle: string;
  recipeServings: number;
  servings: number;
  label: string | null;
  cookedAt: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const owned = (userId: string, id: string) => and(eq(planEntries.id, id), eq(planEntries.userId, userId));

async function nextPosition(tx: DbOrTx, userId: string, date: string): Promise<number> {
  const [row] = await tx
    .select({ top: max(planEntries.position) })
    .from(planEntries)
    .where(and(eq(planEntries.userId, userId), eq(planEntries.date, date)));
  return (row?.top ?? -1) + 1;
}

export async function listWeek(userId: string, weekStart: string): Promise<PlanEntryView[]> {
  return db
    .select({
      id: planEntries.id,
      date: planEntries.date,
      position: planEntries.position,
      recipeId: planEntries.recipeId,
      recipeTitle: recipes.title,
      recipeServings: recipes.servings,
      servings: planEntries.servings,
      label: planEntries.label,
      cookedAt: planEntries.cookedAt,
    })
    .from(planEntries)
    .innerJoin(recipes, and(eq(recipes.id, planEntries.recipeId), eq(recipes.userId, userId)))
    .where(and(eq(planEntries.userId, userId), gte(planEntries.date, weekStart), lte(planEntries.date, addDays(weekStart, 6))))
    .orderBy(asc(planEntries.date), asc(planEntries.position));
}

export async function addPlanEntry(userId: string, input: PlanEntryInput): Promise<string | null> {
  if (!UUID.test(input.recipeId)) return null;
  return db.transaction(async (tx) => {
    const [recipe] = await tx
      .select({ servings: recipes.servings })
      .from(recipes)
      .where(and(eq(recipes.id, input.recipeId), eq(recipes.userId, userId)));
    if (!recipe) return null;
    const position = await nextPosition(tx, userId, input.date);
    const [row] = await tx
      .insert(planEntries)
      .values({ userId, recipeId: input.recipeId, date: input.date, position, servings: input.servings ?? recipe.servings, label: input.label })
      .returning({ id: planEntries.id });
    return row.id;
  });
}

export async function updatePlanEntry(userId: string, id: string, update: PlanEntryUpdate): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db.update(planEntries).set(update).where(owned(userId, id)).returning({ id: planEntries.id });
  return rows.length > 0;
}

/** Swaps the entry with its neighbour on the same day. False when it is already first/last. */
export async function movePlanEntry(userId: string, id: string, direction: "up" | "down"): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const [entry] = await tx.select({ date: planEntries.date, position: planEntries.position }).from(planEntries).where(owned(userId, id));
    if (!entry) return false;
    const sameDay = and(eq(planEntries.userId, userId), eq(planEntries.date, entry.date));
    const [neighbour] = await tx
      .select({ id: planEntries.id, position: planEntries.position })
      .from(planEntries)
      .where(and(sameDay, direction === "up" ? lt(planEntries.position, entry.position) : gt(planEntries.position, entry.position)))
      .orderBy(direction === "up" ? desc(planEntries.position) : asc(planEntries.position))
      .limit(1);
    if (!neighbour) return false;
    await tx.update(planEntries).set({ position: neighbour.position }).where(owned(userId, id));
    await tx.update(planEntries).set({ position: entry.position }).where(owned(userId, neighbour.id));
    return true;
  });
}

export async function movePlanEntryToDate(userId: string, id: string, date: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const [entry] = await tx.select({ date: planEntries.date }).from(planEntries).where(owned(userId, id));
    if (!entry) return false;
    if (entry.date === date) return true;
    const position = await nextPosition(tx, userId, date);
    await tx.update(planEntries).set({ date, position }).where(owned(userId, id));
    return true;
  });
}

export async function setPlanEntryCooked(userId: string, id: string, cooked: boolean): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .update(planEntries)
    .set({ cookedAt: cooked ? new Date() : null })
    .where(owned(userId, id))
    .returning({ id: planEntries.id });
  return rows.length > 0;
}

export async function removePlanEntry(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db.delete(planEntries).where(owned(userId, id)).returning({ id: planEntries.id });
  return rows.length > 0;
}

export async function countPlanned(userId: string, recipeId: string): Promise<number> {
  if (!UUID.test(recipeId)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(planEntries)
    .where(and(eq(planEntries.userId, userId), eq(planEntries.recipeId, recipeId)));
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Change `deleteRecipe` in `db/queries/recipes.ts`**

Change the drizzle import to include `count`, and the schema import to include `planEntries`:

```ts
import { and, arrayContains, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { planEntries, recipeIngredients, recipes } from "@/db/schema";
```

Replace `deleteRecipe` with:

```ts
export type DeleteRecipeResult = { status: "deleted"; imagePath: string | null } | { status: "planned"; count: number };

/**
 * Deletes the user's recipe. If it is still planned, returns `{ status: "planned" }` instead,
 * unless `removePlanEntries` is set, in which case its plan entries are deleted too.
 */
export async function deleteRecipe(
  userId: string,
  id: string,
  opts: { removePlanEntries?: boolean } = {},
): Promise<DeleteRecipeResult | null> {
  if (!UUID.test(id)) return null;
  return db.transaction(async (tx) => {
    const ownedRecipe = and(eq(recipes.id, id), eq(recipes.userId, userId));
    const [recipe] = await tx.select({ id: recipes.id }).from(recipes).where(ownedRecipe);
    if (!recipe) return null;
    const plannedFor = and(eq(planEntries.recipeId, id), eq(planEntries.userId, userId));
    const [{ n }] = await tx.select({ n: count() }).from(planEntries).where(plannedFor);
    if (n > 0) {
      if (!opts.removePlanEntries) return { status: "planned", count: n };
      await tx.delete(planEntries).where(plannedFor);
    }
    const [row] = await tx.delete(recipes).where(ownedRecipe).returning({ imagePath: recipes.imagePath });
    return row ? { status: "deleted", imagePath: row.imagePath } : null;
  });
}
```

`deleteRecipeAction` in `app/(app)/recipes/actions.ts` now fails the type check. Task 7 rewrites it. Until then, change its body to use the result:

```ts
  const deleted = await deleteRecipe(user.id, recipeId);
  if (deleted?.status === "deleted" && deleted.imagePath) await removePhoto(deleted.imagePath);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:int && pnpm exec tsc --noEmit`
Expected: PASS: all integration tests, and no type errors.

- [ ] **Step 6: Commit**

```bash
git add db/queries tests/integration "app/(app)/recipes/actions.ts"
git commit -m "Add plan queries and block deleting planned recipes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Today in the user's time zone

**Files:**
- Create: `server/today.ts`, `components/timezone-cookie.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `todayIn` from `@/lib/dates`
- Produces:
  - `getToday(): Promise<string>` from `@/server/today`
  - the `TimezoneCookie` client component, which writes the cookie `tz=<IANA name>` (path `/`, one year, `SameSite=Lax`)

The logic under test is `todayIn` (Task 2). This task is wiring, verified by the Task 8 e2e run in the `America/Los_Angeles` time zone.

- [ ] **Step 1: Implement `server/today.ts`**

```ts
import "server-only";
import { cookies } from "next/headers";
import { todayIn } from "@/lib/dates";

/** Today's date in the user's time zone (from the `tz` cookie set by <TimezoneCookie />), else UTC. */
export async function getToday(): Promise<string> {
  const tz = (await cookies()).get("tz")?.value;
  return todayIn(tz ? decodeURIComponent(tz) : undefined);
}
```

- [ ] **Step 2: Implement `components/timezone-cookie.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Saves the browser's time zone in a cookie so the server knows the user's "today". */
export function TimezoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.split("; ").find((c) => c.startsWith("tz="))?.slice(3);
    if (!tz || current === encodeURIComponent(tz)) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    // Re-render server components that already used the UTC fallback.
    router.refresh();
  }, [router]);
  return null;
}
```

- [ ] **Step 3: Render it in the app shell**

In `app/(app)/layout.tsx`, import it:

```ts
import { TimezoneCookie } from "@/components/timezone-cookie";
```

and add `<TimezoneCookie />` as the first child of the outer `<div className="flex min-h-full flex-col">`.

- [ ] **Step 4: Type-check, lint and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: both clean. (`react-hooks` lint rules are satisfied because `router` is in the dependency array.)

```bash
git add server/today.ts components/timezone-cookie.tsx "app/(app)/layout.tsx"
git commit -m "Compute today in the user's time zone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Plan page, actions, "Add to plan" and the planned-recipe delete

**Files:**
- Create:
  - `components/confirm-form.tsx`
  - `app/(app)/plan/actions.ts`, `add-entry-form.tsx`, `entry-editor.tsx`, `entry-card.tsx`, `page.tsx`, `error.tsx` (all in `app/(app)/plan/`)
- Modify:
  - `components/app-nav.tsx`
  - `app/(app)/recipes/actions.ts`
  - `app/(app)/recipes/[id]/page.tsx`
  - `app/(app)/recipes/[id]/delete-button.tsx`

**Interfaces:**
- Consumes:
  - all of `@/db/queries/plan` (Task 5), `deleteRecipe` / `DeleteRecipeResult` (Task 5) and `listRecipes` (phase 1)
  - `parseAddEntry`, `parseEntryUpdate`, `PlanFieldErrors` (Task 3)
  - `formatDay`, `formatWeekRange`, `isIsoDate`, `mondayOf`, `resolveWeek`, `weekDays`, `addDays` (Task 2)
  - `getToday` (Task 6), and `requireUser`, `ui`, `removePhoto` (phase 1)
- Produces:
  - `ConfirmForm({ action, message, children, className? })`
  - `AddEntryState`, `EntryEditState`
  - the actions `addPlanEntryAction(prev, fd)`, `updatePlanEntryAction(entryId, prev, fd)`, `movePlanEntryAction(entryId, direction)`, `moveToDateAction(entryId, fd)`, `setCookedAction(entryId, cooked)`, `removePlanEntryAction(entryId)`
  - `deleteRecipeAction(recipeId, removePlanned)`

- [ ] **Step 1: The confirm form and the Plan tab**

`components/confirm-form.tsx`:

```tsx
"use client";

/** A form that asks `message` in a confirm dialog before submitting its Server Action. */
export function ConfirmForm({
  action,
  message,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
```

In `components/app-nav.tsx`, change `TABS` to:

```ts
// Later phases add List and Inventory here.
const TABS = [
  { href: "/recipes", label: "Recipes" },
  { href: "/plan", label: "Plan" },
];
```

- [ ] **Step 2: Plan Server Actions**

`app/(app)/plan/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addPlanEntry,
  movePlanEntry,
  movePlanEntryToDate,
  removePlanEntry,
  setPlanEntryCooked,
  updatePlanEntry,
} from "@/db/queries/plan";
import { isIsoDate, mondayOf } from "@/lib/dates";
import { parseAddEntry, parseEntryUpdate, type PlanFieldErrors } from "@/lib/plan-input";
import { requireUser } from "@/server/auth";

export type AddEntryState = { fieldErrors: PlanFieldErrors } | null;
export type EntryEditState = { fieldErrors: PlanFieldErrors; saved?: boolean } | null;

export async function addPlanEntryAction(_prev: AddEntryState, formData: FormData): Promise<AddEntryState> {
  const user = await requireUser("/plan");
  const parsed = parseAddEntry(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  const id = await addPlanEntry(user.id, parsed.data);
  if (!id) return { fieldErrors: { recipeId: "Pick one of your recipes" } };
  revalidatePath("/plan");
  redirect(`/plan?week=${mondayOf(parsed.data.date)}`);
}

export async function updatePlanEntryAction(entryId: string, _prev: EntryEditState, formData: FormData): Promise<EntryEditState> {
  const user = await requireUser("/plan");
  const parsed = parseEntryUpdate(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  await updatePlanEntry(user.id, entryId, parsed.data);
  revalidatePath("/plan");
  return { fieldErrors: {}, saved: true };
}

export async function movePlanEntryAction(entryId: string, direction: "up" | "down"): Promise<void> {
  const user = await requireUser("/plan");
  await movePlanEntry(user.id, entryId, direction === "up" ? "up" : "down");
  revalidatePath("/plan");
}

export async function moveToDateAction(entryId: string, formData: FormData): Promise<void> {
  const user = await requireUser("/plan");
  const date = formData.get("date");
  if (typeof date === "string" && isIsoDate(date)) await movePlanEntryToDate(user.id, entryId, date);
  revalidatePath("/plan");
}

export async function setCookedAction(entryId: string, cooked: boolean): Promise<void> {
  const user = await requireUser("/plan");
  await setPlanEntryCooked(user.id, entryId, cooked === true);
  revalidatePath("/plan");
}

export async function removePlanEntryAction(entryId: string): Promise<void> {
  const user = await requireUser("/plan");
  await removePlanEntry(user.id, entryId);
  revalidatePath("/plan");
}
```

- [ ] **Step 3: The add form and the entry editor (client)**

`app/(app)/plan/add-entry-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ui } from "@/components/ui";
import { addPlanEntryAction, type AddEntryState } from "./actions";

type Props =
  | { mode: "day"; date: string; recipes: { id: string; title: string }[] }
  | { mode: "recipe"; recipeId: string; defaultDate: string; defaultServings: number };

export function AddEntryForm(props: Props) {
  const [state, action, pending] = useActionState<AddEntryState, FormData>(addPlanEntryAction, null);
  const errors = state?.fieldErrors ?? {};
  const idPrefix = props.mode === "day" ? `add-${props.date}` : "add-to-plan";

  if (props.mode === "day" && props.recipes.length === 0) {
    return (
      <p className={ui.hint}>
        No recipes yet.{" "}
        <Link href="/recipes/new" className="underline">
          Add one
        </Link>{" "}
        to plan it.
      </p>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-3" noValidate>
      {props.mode === "day" ? (
        <>
          <input type="hidden" name="date" value={props.date} />
          <div>
            <label htmlFor={`${idPrefix}-recipe`} className={ui.label}>
              Recipe
            </label>
            <select id={`${idPrefix}-recipe`} name="recipeId" defaultValue="" aria-invalid={!!errors.recipeId} className={ui.input}>
              <option value="" disabled>
                Choose a recipe…
              </option>
              {props.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            {errors.recipeId && <p className={ui.error}>{errors.recipeId}</p>}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="recipeId" value={props.recipeId} />
          <div>
            <label htmlFor={`${idPrefix}-date`} className={ui.label}>
              Day
            </label>
            <input id={`${idPrefix}-date`} name="date" type="date" defaultValue={props.defaultDate} aria-invalid={!!errors.date} className={ui.input} />
            {errors.date && <p className={ui.error}>{errors.date}</p>}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <div className="w-28">
          <label htmlFor={`${idPrefix}-servings`} className={ui.label}>
            Servings
          </label>
          <input
            id={`${idPrefix}-servings`}
            name="servings"
            type="number"
            inputMode="decimal"
            min={0.5}
            max={100}
            step={0.5}
            placeholder="Recipe's"
            defaultValue={props.mode === "recipe" ? props.defaultServings : undefined}
            aria-invalid={!!errors.servings}
            className={ui.input}
          />
        </div>
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-label`} className={ui.label}>
            Label (optional)
          </label>
          <input id={`${idPrefix}-label`} name="label" maxLength={40} placeholder="Dinner" aria-invalid={!!errors.label} className={ui.input} />
        </div>
      </div>
      {errors.servings && <p className={ui.error}>{errors.servings}</p>}
      {errors.label && <p className={ui.error}>{errors.label}</p>}
      <button type="submit" disabled={pending} className={ui.button}>
        {pending ? "Adding…" : props.mode === "day" ? "Add" : "Add to plan"}
      </button>
    </form>
  );
}
```

`app/(app)/plan/entry-editor.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { EntryEditState } from "./actions";

export function EntryEditor({
  entryId,
  servings,
  label,
  action,
}: {
  entryId: string;
  servings: number;
  label: string | null;
  action: (prev: EntryEditState, formData: FormData) => Promise<EntryEditState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
      <div className="w-24">
        <label htmlFor={`entry-${entryId}-servings`} className={ui.label}>
          Servings
        </label>
        <input id={`entry-${entryId}-servings`} name="servings" type="number" inputMode="decimal" min={0.5} max={100} step={0.5} defaultValue={servings} aria-invalid={!!errors.servings} className={ui.input} />
      </div>
      <div className="min-w-32 flex-1">
        <label htmlFor={`entry-${entryId}-label`} className={ui.label}>
          Label
        </label>
        <input id={`entry-${entryId}-label`} name="label" maxLength={40} defaultValue={label ?? ""} aria-invalid={!!errors.label} className={ui.input} />
      </div>
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
      {(errors.servings || errors.label) && <p className={`${ui.error} w-full`}>{errors.servings ?? errors.label}</p>}
      {state?.saved && (
        <p role="status" className={`${ui.hint} w-full`}>
          Saved.
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: The entry card and the plan page**

`app/(app)/plan/entry-card.tsx`:

```tsx
import Link from "next/link";
import { ConfirmForm } from "@/components/confirm-form";
import { ui } from "@/components/ui";
import type { PlanEntryView } from "@/db/queries/plan";
import { formatDay } from "@/lib/dates";
import { formatQuantity } from "@/lib/units";
import { movePlanEntryAction, moveToDateAction, removePlanEntryAction, setCookedAction, updatePlanEntryAction } from "./actions";
import { EntryEditor } from "./entry-editor";

const iconButton =
  "inline-flex size-9 items-center justify-center rounded-lg border border-neutral-300 text-sm disabled:opacity-30 dark:border-neutral-700";

export function EntryCard({ entry, isFirst, isLast, isPast, days }: { entry: PlanEntryView; isFirst: boolean; isLast: boolean; isPast: boolean; days: string[] }) {
  const cooked = entry.cookedAt !== null;
  const servingsText = `${formatQuantity(entry.servings)} serving${entry.servings === 1 ? "" : "s"}`;
  return (
    <article aria-label={entry.recipeTitle} className={`${ui.card} ${cooked ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/recipes/${entry.recipeId}`} className={`font-medium hover:underline ${cooked ? "line-through" : ""}`}>
            {entry.recipeTitle}
          </Link>
          <p className="text-sm text-neutral-500">
            {servingsText}
            {entry.label && <span className={`${ui.chip} ml-2 py-0 text-xs`}>{entry.label}</span>}
            {cooked && <span className="ml-2 text-emerald-700 dark:text-emerald-400">✓ Cooked</span>}
          </p>
        </div>
        <div className="flex gap-1">
          <form action={movePlanEntryAction.bind(null, entry.id, "up")}>
            <button type="submit" aria-label="Move up" disabled={isFirst} className={iconButton}>
              ↑
            </button>
          </form>
          <form action={movePlanEntryAction.bind(null, entry.id, "down")}>
            <button type="submit" aria-label="Move down" disabled={isLast} className={iconButton}>
              ↓
            </button>
          </form>
        </div>
      </div>

      {isPast && (
        <p role="note" className="mt-2 text-sm text-amber-800 dark:text-amber-400">
          From an earlier day. Mark it cooked or remove it?
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={setCookedAction.bind(null, entry.id, !cooked)}>
          <button type="submit" className={cooked ? ui.buttonSecondary : ui.button}>
            {cooked ? "Mark not cooked" : "Mark cooked"}
          </button>
        </form>
        <ConfirmForm action={removePlanEntryAction.bind(null, entry.id)} message={`Remove “${entry.recipeTitle}” from ${formatDay(entry.date)}?`}>
          <button type="submit" className={ui.buttonDanger}>
            Remove
          </button>
        </ConfirmForm>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">Edit or move</summary>
        <EntryEditor entryId={entry.id} servings={entry.servings} label={entry.label} action={updatePlanEntryAction.bind(null, entry.id)} />
        <form action={moveToDateAction.bind(null, entry.id)} className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor={`entry-${entry.id}-day`} className={ui.label}>
              Move to
            </label>
            <select id={`entry-${entry.id}-day`} name="date" defaultValue={entry.date} className={ui.input}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatDay(d)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={ui.buttonSecondary}>
            Move
          </button>
        </form>
      </details>
    </article>
  );
}
```

`app/(app)/plan/page.tsx`:

```tsx
import Link from "next/link";
import { ui } from "@/components/ui";
import { listWeek } from "@/db/queries/plan";
import { listRecipes } from "@/db/queries/recipes";
import { addDays, formatDay, formatWeekRange, mondayOf, resolveWeek, weekDays } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getToday } from "@/server/today";
import { AddEntryForm } from "./add-entry-form";
import { EntryCard } from "./entry-card";

export default async function PlanPage(props: PageProps<"/plan">) {
  const user = await requireUser("/plan");
  const params = await props.searchParams;
  const today = await getToday();
  const weekStart = resolveWeek(typeof params.week === "string" ? params.week : undefined, today);
  const [entries, recipes] = await Promise.all([listWeek(user.id, weekStart), listRecipes(user.id)]);
  const days = weekDays(weekStart);
  const recipeOptions = recipes.map((r) => ({ id: r.id, title: r.title })).sort((a, b) => a.title.localeCompare(b.title));
  const isThisWeek = weekStart === mondayOf(today);

  return (
    <main className={ui.page}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={ui.h1}>Plan</h1>
        <p className="text-neutral-600 dark:text-neutral-400" aria-live="polite">
          Week of {formatWeekRange(weekStart)}
        </p>
      </div>
      <nav aria-label="Weeks" className="mb-6 flex gap-2">
        <Link href={`/plan?week=${addDays(weekStart, -7)}`} className={ui.buttonSecondary}>
          ← Previous
        </Link>
        {!isThisWeek && (
          <Link href="/plan" className={ui.buttonSecondary}>
            This week
          </Link>
        )}
        <Link href={`/plan?week=${addDays(weekStart, 7)}`} className={ui.buttonSecondary}>
          Next →
        </Link>
      </nav>

      <div className="space-y-6">
        {days.map((day) => {
          const dayEntries = entries.filter((e) => e.date === day);
          const headingId = `day-${day}`;
          return (
            <section key={day} aria-labelledby={headingId}>
              <h2 id={headingId} className="mb-2 flex items-center gap-2 text-lg font-semibold">
                {formatDay(day)}
                {day === today && <span className={`${ui.chipActive} py-0 text-xs`}>Today</span>}
              </h2>
              {dayEntries.length === 0 ? (
                <p className={ui.hint}>Nothing planned.</p>
              ) : (
                <ul className="space-y-2">
                  {dayEntries.map((entry, i) => (
                    <li key={entry.id}>
                      <EntryCard entry={entry} isFirst={i === 0} isLast={i === dayEntries.length - 1} isPast={day < today && entry.cookedAt === null} days={days} />
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-emerald-700 dark:text-emerald-400">Add a recipe</summary>
                <AddEntryForm mode="day" date={day} recipes={recipeOptions} />
              </details>
            </section>
          );
        })}
      </div>
    </main>
  );
}
```

`app/(app)/plan/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { ui } from "@/components/ui";

export default function PlanError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>Something went wrong</h1>
      <p className="mt-2">We couldn’t load your plan.</p>
      <button type="button" onClick={() => retry()} className={`${ui.button} mt-4`}>
        Try again
      </button>
    </main>
  );
}
```

- [ ] **Step 5: "Add to plan" and the planned-recipe delete on the recipe page**

In `app/(app)/recipes/actions.ts`, replace `deleteRecipeAction` with:

```ts
export async function deleteRecipeAction(recipeId: string, removePlanned: boolean): Promise<void> {
  const user = await requireUser();
  const result = await deleteRecipe(user.id, recipeId, { removePlanEntries: removePlanned === true });
  // Planned since the page was rendered: show the recipe again with the up-to-date count.
  if (result?.status === "planned") redirect(`/recipes/${recipeId}?planned=${result.count}`);
  if (result?.status === "deleted" && result.imagePath) await removePhoto(result.imagePath);
  revalidatePath("/recipes");
  revalidatePath("/plan");
  redirect("/recipes");
}
```

Replace `app/(app)/recipes/[id]/delete-button.tsx` with:

```tsx
import { ConfirmForm } from "@/components/confirm-form";
import { ui } from "@/components/ui";

export function DeleteRecipeButton({ action, title, plannedCount }: { action: (formData: FormData) => Promise<void>; title: string; plannedCount: number }) {
  const planned =
    plannedCount > 0 ? ` It’s in ${plannedCount} planned meal${plannedCount === 1 ? "" : "s"}, which will be removed too.` : "";
  return (
    <ConfirmForm action={action} message={`Delete “${title}”?${planned} This can’t be undone.`}>
      <button type="submit" className={ui.buttonDanger}>
        Delete
      </button>
    </ConfirmForm>
  );
}
```

In `app/(app)/recipes/[id]/page.tsx`:
- Add these imports:
  ```ts
  import { countPlanned } from "@/db/queries/plan";
  import { getToday } from "@/server/today";
  import { AddEntryForm } from "../../plan/add-entry-form";
  ```
- After `if (!recipe) notFound();`, add:
  ```ts
  const [plannedCount, today, search] = await Promise.all([countPlanned(user.id, recipe.id), getToday(), props.searchParams]);
  const plannedNotice = typeof search.planned === "string" ? Number(search.planned) : 0;
  ```
- Replace the `<DeleteRecipeButton … />` element with:
  ```tsx
  <DeleteRecipeButton action={deleteRecipeAction.bind(null, recipe.id, plannedCount > 0)} title={recipe.title} plannedCount={plannedCount} />
  ```
- Directly after the closing `</div>` of the title row, add:
  ```tsx
  {plannedNotice > 0 && (
    <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      This recipe was just added to a plan. Delete it again to remove it from {plannedNotice} planned meal{plannedNotice === 1 ? "" : "s"}.
    </p>
  )}
  ```
- Directly before the `{recipe.notes && (` block, add:
  ```tsx
  <section aria-labelledby="plan-heading" className={`${ui.card} mt-8`}>
    <h2 id="plan-heading" className="text-lg font-semibold">
      Add to plan
    </h2>
    {plannedCount > 0 && (
      <p className={ui.hint}>
        Planned {plannedCount} time{plannedCount === 1 ? "" : "s"}.{" "}
        <Link href="/plan" className="underline">
          See the plan
        </Link>
      </p>
    )}
    <AddEntryForm mode="recipe" recipeId={recipe.id} defaultDate={today} defaultServings={recipe.servings} />
  </section>
  ```

- [ ] **Step 6: Type-check, lint and try it by hand**

Run: `pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all clean and passing.

Run the app (`pnpm dev`, or `SITE_URL=http://localhost:3001 pnpm dev --port 3001` if port 3000 is taken), sign in, and check:
1. There's a **Plan** tab. `/plan` shows this week's Monday to Sunday, with today marked. Previous, Next and This week move between weeks. `/plan?week=junk` shows this week.
2. On a recipe, **Add to plan** for today with a label. Expected: you land on `/plan`, and the recipe appears under today with its label and servings.
3. Add a second recipe to the same day from the day's **Add a recipe** form, then press ↑ on it. Expected: it moves above the first. ↑ on the first entry is disabled.
4. **Edit or move:** change the servings and save, then move it to another day.
5. **Mark cooked** shows ✓ Cooked; **Mark not cooked** reverts it. **Remove** asks first.
6. Add an entry for yesterday (recipe page, Day = yesterday). Expected: that entry shows "From an earlier day…".
7. Delete a planned recipe. Expected: the confirm dialog names the number of planned meals. After you accept, the recipe and its entries are gone.

- [ ] **Step 7: Commit**

```bash
git add components "app/(app)"
git commit -m "Add the weekly plan page and Add to plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end tests

**Files:**
- Create: `tests/e2e/plan.spec.ts`
- Modify: `tests/e2e/helpers.ts`

**Interfaces:**
- Consumes: the whole app, and `signInAsNewUser` and `deleteUser` from `tests/e2e/helpers.ts`
- Produces: `createRecipeViaUi(page, title, servings, ingredients): Promise<string>` in `tests/e2e/helpers.ts`, which returns the recipe URL

- [ ] **Step 1: Add a recipe-creation helper**

Append to `tests/e2e/helpers.ts`:

```ts
export async function createRecipeViaUi(page: Page, title: string, servings: number, ingredients: string): Promise<string> {
  await page.goto("/recipes/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Servings", { exact: true }).fill(String(servings));
  await page.getByLabel("Ingredients", { exact: true }).fill(ingredients);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await page.getByRole("heading", { level: 1, name: title }).waitFor();
  return page.url();
}
```

- [ ] **Step 2: Write the e2e tests**

`tests/e2e/plan.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "./helpers";

// Late on a Sunday in Los Angeles, UTC is already Monday; the plan must follow the user's zone.
const TIME_ZONE = "America/Los_Angeles";
test.use({ timezoneId: TIME_ZONE });

const localDate = (offsetDays = 0) => {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
};

const todaySection = (page: Page) => page.getByRole("region", { name: /Today/ });

test.describe("meal plan", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("plan, reorder, edit, cook and remove meals", async ({ page }) => {
    const soupUrl = await createRecipeViaUi(page, "Tomato soup", 4, "1 can tomatoes");
    await createRecipeViaUi(page, "Grilled cheese", 2, "2 slices bread");

    await page.goto(soupUrl);
    await expect(page.getByLabel("Day", { exact: true })).toHaveValue(localDate());
    await page.getByLabel("Servings", { exact: true }).fill("2");
    await page.getByLabel("Label (optional)").fill("Dinner");
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan\?week=/);

    const today = todaySection(page);
    const soup = today.getByRole("article", { name: "Tomato soup" });
    await expect(soup).toContainText("2 servings");
    await expect(soup).toContainText("Dinner");

    await today.getByText("Add a recipe").click();
    await today.getByLabel("Recipe", { exact: true }).selectOption({ label: "Grilled cheese" });
    await today.getByRole("button", { name: "Add", exact: true }).click();
    await expect(todaySection(page).getByRole("article")).toHaveText([/Tomato soup/, /Grilled cheese/]);

    await todaySection(page).getByRole("article", { name: "Grilled cheese" }).getByRole("button", { name: "Move up" }).click();
    await expect(todaySection(page).getByRole("article")).toHaveText([/Grilled cheese/, /Tomato soup/]);
    await expect(todaySection(page).getByRole("article", { name: "Grilled cheese" }).getByRole("button", { name: "Move up" })).toBeDisabled();

    const soupCard = todaySection(page).getByRole("article", { name: "Tomato soup" });
    await soupCard.getByText("Edit or move").click();
    await soupCard.getByLabel("Servings", { exact: true }).fill("3");
    await soupCard.getByRole("button", { name: "Save" }).click();
    await expect(soupCard).toContainText("3 servings");

    await soupCard.getByRole("button", { name: "Mark cooked" }).click();
    await expect(soupCard).toContainText("✓ Cooked");
    await soupCard.getByRole("button", { name: "Mark not cooked" }).click();
    await expect(soupCard).not.toContainText("✓ Cooked");

    page.once("dialog", (dialog) => dialog.accept());
    await todaySection(page).getByRole("article", { name: "Grilled cheese" }).getByRole("button", { name: "Remove" }).click();
    await expect(todaySection(page).getByRole("article")).toHaveText([/Tomato soup/]);
  });

  test("uncooked meals from an earlier day get a nudge", async ({ page }) => {
    const url = await createRecipeViaUi(page, "Leftover stew", 2, "1 onion");
    await page.goto(url);
    await page.getByLabel("Day", { exact: true }).fill(localDate(-1));
    await page.getByRole("button", { name: "Add to plan" }).click();
    await page.goto(`/plan?week=${localDate(-1)}`);
    const stew = page.getByRole("article", { name: "Leftover stew" });
    await expect(stew.getByRole("note")).toHaveText("From an earlier day. Mark it cooked or remove it?");
    await stew.getByRole("button", { name: "Mark cooked" }).click();
    await expect(page.getByRole("article", { name: "Leftover stew" }).getByRole("note")).toHaveCount(0);
  });

  test("week navigation and a bad week in the URL", async ({ page }) => {
    await page.goto("/plan?week=2026-10-01");
    await expect(page.getByText("Week of Sep 28 – Oct 4")).toBeVisible();
    await page.getByRole("link", { name: "Next →" }).click();
    await expect(page).toHaveURL(/week=2026-10-05$/);
    await expect(page.getByText("Week of Oct 5 – Oct 11")).toBeVisible();

    await page.goto("/plan?week=2026-02-30");
    await expect(page.getByRole("region", { name: /Today/ })).toBeVisible();
  });

  test("deleting a planned recipe says how many meals it removes", async ({ page }) => {
    const url = await createRecipeViaUi(page, "Planned pie", 8, "2 cups flour");
    await page.goto(url);
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan/);

    await page.goto(url);
    let message = "";
    page.once("dialog", (dialog) => {
      message = dialog.message();
      void dialog.accept();
    });
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    expect(message).toContain("1 planned meal, which will be removed too");

    await page.goto("/plan");
    await expect(page.getByRole("article", { name: "Planned pie" })).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Run all the e2e tests**

Stop any dev server that's running in this directory, then run: `pnpm test:e2e`
Expected: PASS: phase 1's 8 tests plus these 4. If the "Today" region isn't found right after sign-in, the time-zone cookie refresh hasn't landed yet. The fix is to wait for the region in the test, not to change the app. Ledger it.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "Add meal plan end-to-end tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs and final checks

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `docs/LICENSING.md` (only if licenses changed)

- [ ] **Step 1: Roadmap**

In `docs/ROADMAP.md`:
- In the phase table, set phase 1's status to `Done` if PR #1 has merged by then (otherwise leave it). Set phase 2 to `In review` with its PR link once the PR exists, and phase 3 to `Next`.
- In the Backlog, remove the three ★ parser lines, and remove the sentence "Before phase 3, fix the parser items marked ★…".
- Log anything deferred during this phase in the Backlog, per AGENTS.md.

- [ ] **Step 2: Changelog**

Under `## [Unreleased]` in `docs/CHANGELOG.md`, add:

```markdown
### Added
- **Meal plan** (`/plan`): Monday–Sunday weeks, any number of recipes per day with their own servings (whole or half) and an optional label. Reorder, move to another day, edit, mark cooked, remove.
- **Add to plan** on recipe pages.
- **Plan** tab in the navigation.
- A nudge on uncooked meals from earlier days.
- "Today" follows your own time zone.

### Changed
- Deleting a recipe that's in the plan now says how many planned meals it will remove.

### Fixed
- The ingredient parser reads container sizes ("2 14-ounce cans chickpeas", "1 x 400g tin tomatoes"), irregular plurals ("bay leaves", "molasses") and a bare count such as "2 cloves".
```

- [ ] **Step 2b: Decisions**

Append to `docs/DECISIONS.md`:

```markdown
### D13. Plan dates are calendar strings; "today" comes from the browser's time zone
`plan_entries.date` is a Postgres `date` handled as `YYYY-MM-DD`, with all date math in UTC. The browser saves its IANA time zone in a `tz` cookie, and the server computes "today" in that zone, falling back to UTC.
**Why:** a planned day is a calendar day, not an instant, and servers run in UTC.
**Cost:** the first request before the cookie is set uses UTC; the page refreshes once the cookie is written.

### D14. Planned recipes can't be deleted silently
The foreign key from `plan_entries.recipe_id` is `NO ACTION`, which blocks the delete but still lets a deleted user's rows cascade. `deleteRecipe` reports `{ status: "planned", count }` unless the caller asks to remove the plan entries, and the UI confirms with the count. The plan's row-level security policy also requires the recipe to belong to the same user.
**Why:** spec §3, without the cascade-order failure that `RESTRICT` causes.
**Cost:** a meal planned in another tab between page load and delete leads to a second confirmation.

### D15. Plan edits are plain form submissions
Plan changes re-render the page after each Server Action. `useOptimistic` is kept for phase 3's check-offs, where speed matters most.
**Why:** simpler, and it works before JavaScript loads.
**Cost:** each plan change waits for a server round trip.
```

- [ ] **Step 3: Licensing check (AGENTS.md)**

Run: `pnpm licenses list --prod`
Expected: the same license counts as recorded in `docs/LICENSING.md` (no new dependencies in this phase). If anything changed, update `docs/LICENSING.md`.

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm test && pnpm test:int && pnpm build`, and `pnpm test:e2e` with the dev server stopped.
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "Docs for phase 2: roadmap, changelog and decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
