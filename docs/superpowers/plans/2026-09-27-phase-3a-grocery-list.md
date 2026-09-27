# Phase 3a: Grocery List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly grocery list at `/list`, generated from the week's uncooked planned meals. Ingredients are scaled to each meal's servings, merged across recipes, shown in readable units and grouped by store section. You can check items off (instantly, with `useOptimistic`), hide items for the week, and add your own extras. If the plan grows after you've shopped, only the extra amount shows as still needed. This phase starts with the four ★ parser items grocery merging depends on, plus a one-off re-parse of existing recipes.

**Scope:** Spec phase 3 is split in two. **3a (this plan)** is the grocery list. **3b** is offline support, spec §7: an IndexedDB snapshot and queue, then a service worker. It gets its own plan, because the spec already puts it last and says it may slip.

**Architecture:**
- `lib/grocery.ts` is a pure function: (ingredients of the week's uncooked entries, marks, extras) → sections of lines. It's covered by table-driven unit tests for every rule in spec §5.
- `lib/units.ts` gains conversion to base units and readable output.
- Two new tables, with the same access-control pattern as before (query helpers filter by `user_id`, and RLS protects the Data API): `grocery_marks` (checked and hidden state per week and line key) and `grocery_extras`.
- The list page is a Server Component. A client component applies optimistic check-offs, and the server recomputes each line's amount when it's checked, so the client never sends a quantity.

**Tech Stack:** as before (Next.js 16.3, React 19.2, Supabase, Drizzle 0.45, Zod 4, Vitest 5, Playwright 1.63). **One new dev dependency: `tsx` 4.x (MIT)**, used only for the re-parse script.

**Spec:** `docs/superpowers/specs/2026-09-27-foodini-meal-planner-design.md`. This plan covers §3 (`grocery_extras`, `grocery_marks`), §4 (`/list`, the List tab), §5 (generating the list, special lines, checking off, with the inventory steps skipped as §5 says for this phase) and §8. It follows the conventions of the phase 1 and phase 2 plans in `docs/superpowers/plans/`.

## Global Constraints

- All earlier Global Constraints still apply:
  - Next 16 conventions: `proxy.ts`, Promise `params`/`searchParams`, `PageProps`, and `error.tsx` receives `retry`. Run `pnpm exec next typegen` after adding a route.
  - No `use cache`.
  - `requireUser()` in every action, and `userId` filtering in every query helper.
  - Plan dates are `YYYY-MM-DD` strings from `lib/dates.ts`, limited to years 1900–2999.
  - `pnpm`, and the commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - AGENTS.md rules: log deferred work in `docs/ROADMAP.md` → Backlog; check licenses and update `docs/LICENSING.md`.
- **Line keys** (the stable identity of a grocery line within a week):
  - A recognized item with an amount: `item:<item_id>:<unitKey>`, where `unitKey` is `volume`, `weight` or `count:<unit|each>`.
  - A recognized item with no amount: `item:<item_id>:<unitKey from the item's unit_kind>`, with `count:each` for count items. This lets it merge with amount lines of the same item.
  - An unparsed line: `raw:<raw text lowercased, whitespace collapsed>`.
  - An extra: `extra:<id>`.

  This refines spec §3's `item:<item_id>:<unit_kind>`: count amounts with different units, like "1 can" and "2 each", can't be added together, so the count unit is part of the key. Record this in DECISIONS.md (Task 9).
- **Before inventory exists (phases 3a–3):** a checked amount means "bought this week".
  - `shortfall = max(0, required − checked_qty)`.
  - A checked line is rendered from its mark.
  - A remaining shortfall shows as a separate unchecked line.
  - In phase 4, checking off adds to inventory instead, and the shortfall subtracts inventory. The result is the same.
- **Base units:** volume in ml, weight in g, and each count unit on its own.
- **Readable output:** a merged line is shown in metric if any contributing ingredient used a metric unit, otherwise in US units.
  - US volume: tsp below 1 tbsp, tbsp below ¼ cup, otherwise cups.
  - US weight: oz below 1 lb, otherwise lb.
  - Metric: ml or g below 1000, otherwise l or kg. Metric numbers are whole from 10 up, 1 decimal below 10, and 2 decimals for l and kg.
- **The client never sends amounts.** Check-off actions take `(week, key)`, and the server recomputes the line and records its current shortfall.
- **Weeks:** `/list?week=` is resolved exactly like `/plan`, with `resolveWeek`.

## Review Focus

1. **The plan grows after shopping:** after checking "2 cups flour" and then planning another floury recipe, the list must show the checked 2 cups and an unchecked line for only the additional amount. Tests: Task 3 `shows a bought line and the remainder when the plan grows`; Task 6 `checks a line, then shows only the additional amount after the plan grows`; Task 8 e2e.
2. **Mixed units for one item** (2 cups flour plus 200 g flour; 1 can tomatoes plus 3 tomatoes) must produce separate lines, never a wrong sum. Test: Task 3 `keeps different unit kinds and different count units apart`.
3. **Cooked meals, other weeks and other users' data** must not reach the list. Test: Task 6 `includes only this week's uncooked meals of this user`.
4. **A forged or stale check-off** (a key that isn't on the list, a key for another week, a malformed week) must be a harmless no-op, not a 500 or a mark for someone else. Tests: Task 6 `ignores a key that is not on the list`; Task 7 action validation.
5. **Unparsed and amount-less lines** ("For the sauce:", "salt to taste") must stay on the list and stay checkable; identical raw lines from two recipes merge. Test: Task 3 `lists unparsed lines under Other, merging identical text`.

---

## File Structure

```
lib/
  units.ts (+ test)          (modify) bag/bottle/box/carton/tub units; toBase(); formatAmount()
  ingredients.ts (+ test)    (modify) ★ inch/size prefixes, "<item> <count unit>", bare-count whitelist
  grocery.ts (+ test)        buildGroceryList(): the pure list builder
db/
  schema.ts                  (modify) grocery_marks, grocery_extras
  migrations/0004_*.sql, 0005_grocery_rls.sql
  queries/recipes.ts         (modify) export insertIngredients
  queries/maintenance.ts     reparseIngredients(userId)
  queries/grocery.ts         loadWeekIngredients, listMarks, listExtras, getGroceryList,
                             check/uncheck/hide lines, add/check/remove extras
scripts/reparse-ingredients.ts   one-off: re-parse every user's recipes
app/(app)/list/
  page.tsx                   week view of the list
  actions.ts                 list Server Actions
  grocery-lines.tsx          client: optimistic check-offs, hide/unhide, extras
  add-extra-form.tsx         client: "Add an item"
  error.tsx
components/app-nav.tsx       (modify) List tab
tests/integration/grocery.test.ts, maintenance.test.ts, rls.test.ts (modify)
tests/e2e/list.spec.ts
docs/ ROADMAP.md, CHANGELOG.md, DECISIONS.md, LICENSING.md (modify)
```

---

### Task 1: ★ Parser fixes for grocery merging

**Files:**
- Modify: `lib/units.ts`, `lib/units.test.ts`, `lib/ingredients.ts`, `lib/ingredients.test.ts`

**Interfaces:**
- Produces: the same exports; new count units `bag`, `bottle`, `box`, `carton` and `tub`; new parse behavior as tested.

- [ ] **Step 1: Write the failing tests**

In `lib/units.test.ts`, add to the `matchUnit` table:

```ts
    [["bags", "potatoes"], "bag", 1],
    [["bottles", "beer"], "bottle", 1],
    [["box", "pasta"], "box", 1],
```

and to `unitLabel`'s test body:

```ts
    expect(unitLabel("box", 2)).toBe("boxes");
    expect(unitLabel("bag", 2)).toBe("bags");
```

In `lib/ingredients.test.ts`, add to the `parseIngredient` table (before the `"8 oz"` row):

```ts
    ["1 5 lb bag potatoes", { quantity: 1, unit: "bag", name: "potatoes", note: "5lb" }],
    ["2 12-ounce bottles beer", { quantity: 2, unit: "bottle", name: "beer", note: "12-ounce" }],
    ["1 9-inch pie crust", { quantity: 1, unit: null, name: "pie crust", note: "9-inch" }],
    ["2 3 lb chickens", { quantity: 2, unit: null, name: "chickens", note: "3lb" }],
    ["3 garlic cloves, minced", { quantity: 3, unit: "clove", name: "garlic", note: "minced" }],
    ["2 cinnamon sticks", { quantity: 2, unit: "stick", name: "cinnamon", note: null }],
    ["2 cans", { quantity: 2, unit: "can", name: null, note: null }],
    ["1 pinch", { quantity: 1, unit: "pinch", name: null, note: null }],
```

These existing rows must keep passing unchanged: `"2 cloves"` → name `"cloves"`; `"3 whole cloves"` → name `"whole cloves"`, unit null; `"2 14-ounce cans chickpeas"`; `"1 x 400g tin tomatoes"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/units.test.ts lib/ingredients.test.ts`
Expected: FAIL on the new rows only.

- [ ] **Step 3: Implement**

In `lib/units.ts`, add to `UNITS` after `jar`:

```ts
  bag: { kind: "count", abbreviation: false, aliases: ["bag", "bags"] },
  bottle: { kind: "count", abbreviation: false, aliases: ["bottle", "bottles"] },
  box: { kind: "count", abbreviation: false, aliases: ["box", "boxes"] },
  carton: { kind: "count", abbreviation: false, aliases: ["carton", "cartons"] },
  tub: { kind: "count", abbreviation: false, aliases: ["tub", "tubs"] },
```

In `lib/ingredients.ts`:

1. Extend `CONTAINER_SIZE` to also accept inch sizes:

```ts
// A size before the item or its container: "14-ounce cans", "400g tin", "5 lb bag", "9-inch pie crust".
const CONTAINER_SIZE = /^(\d+(?:\.\d+)?\s?-?\s?(?:ounces?|oz|grams?|g|kg|ml|l|lbs?|pounds?|inch(?:es)?|in|"))\.?\s+(?=\S)/i;
// Only these count units are items in their own right when nothing follows them ("2 cloves" is the spice).
const BARE_COUNT_ITEMS = new Set(["clove"]);
// Words that describe a count-unit item rather than name another ingredient ("whole cloves", not "whole" × cloves).
const DESCRIPTORS = new Set(["whole", "ground", "dried", "fresh", "large", "small", "medium"]);
```

2. In the `if (size) { … }` block, give the non-container case an `else` branch, so that a size followed by something other than a container becomes a note:

```ts
    if (size) {
      const tokens = rest.slice(size[0].length).split(" ");
      const container = matchUnit(tokens);
      if (container && unitKind(container.unit) === "count") {
        containerNote = size[1].replace(/\s+/g, "");
        unit = container.unit;
        unitWord = tokens.slice(0, container.consumed).join(" ");
        rest = tokens.slice(container.consumed).join(" ");
      } else {
        containerNote = size[1].replace(/\s+/g, "");
        rest = tokens.join(" ");
      }
    }
    if (unit === null && containerNote === null) {
```

(The `if (unit === null)` line that follows becomes `if (unit === null && containerNote === null)`, so the text after a size isn't matched as a unit a second time.)

3. Replace the "bare count unit" block (from `let name = …` through the closing `}` of the `if (name === null …)`) with:

```ts
  let name = words.join(" ").toLowerCase() || null;
  // "3 garlic cloves" → 3 clove garlic, matching "3 cloves garlic". Not "whole cloves", which is the item.
  if (quantity !== null && unit === null && name !== null && words.length >= 2) {
    const last = matchUnit([words[words.length - 1]]);
    if (last && unitKind(last.unit) === "count" && !DESCRIPTORS.has(words[0].toLowerCase())) {
      unit = last.unit;
      name = words.slice(0, -1).join(" ").toLowerCase();
    }
  }
  // "2 cloves" means the spice: only whitelisted count units become the item when nothing follows them.
  if (name === null && unit !== null && unitWord !== null && BARE_COUNT_ITEMS.has(unit)) {
    name = unitWord.toLowerCase();
    unit = null;
  }
```

- [ ] **Step 4: Run the whole unit suite**

Run: `pnpm test`
Expected: PASS, including every earlier parser and section case. If an earlier row now fails, fix the parser, not the row; earlier rows are promised behavior.

- [ ] **Step 5: Commit**

```bash
git add lib/units.ts lib/units.test.ts lib/ingredients.ts lib/ingredients.test.ts
git commit -m "Parse more containers, size prefixes and item-unit order" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Base units and readable amounts

**Files:**
- Modify: `lib/units.ts`, `lib/units.test.ts`

**Interfaces:**
- Produces:
  - `type UnitSystem = "us" | "metric"`
  - `toBase(quantity: number, unit: string | null): { unitKey: string; amount: number; system: UnitSystem | null }`, where `unitKey` is `"volume"`, `"weight"` or `"count:<unit|each>"`
  - `unitKeyForKind(kind: UnitKind): string`, where `count` → `"count:each"`
  - `formatAmount(unitKey: string, amount: number, system: UnitSystem | null): string`

- [ ] **Step 1: Write the failing tests**

Append to `lib/units.test.ts` (and add `formatAmount, toBase, unitKeyForKind` to its import):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/units.test.ts`
Expected: FAIL, because `toBase`, `unitKeyForKind` and `formatAmount` aren't exported.

- [ ] **Step 3: Implement (append to `lib/units.ts`)**

```ts
export type UnitSystem = "us" | "metric";

// Millilitres per volume unit and grams per weight unit.
const TO_BASE: Record<string, number> = {
  tsp: 4.92892, tbsp: 14.7868, cup: 236.588, "fl oz": 29.5735, pint: 473.176, quart: 946.353, gallon: 3785.41,
  ml: 1, l: 1000, g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
};
const METRIC_UNITS = new Set(["ml", "l", "g", "kg"]);

/** Converts to a base amount: ml for volume, g for weight; each count unit stays its own unit. */
export function toBase(quantity: number, unit: string | null): { unitKey: string; amount: number; system: UnitSystem | null } {
  if (unit !== null && TO_BASE[unit] !== undefined) {
    return { unitKey: unitKind(unit), amount: quantity * TO_BASE[unit], system: METRIC_UNITS.has(unit) ? "metric" : "us" };
  }
  return { unitKey: `count:${unit ?? "each"}`, amount: quantity, system: null };
}

export function unitKeyForKind(kind: UnitKind): string {
  return kind === "count" ? "count:each" : kind;
}

const roundMetric = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

function show(quantity: number, unit: string | null, metric: boolean): string {
  const number = metric ? String(quantity) : formatQuantity(quantity);
  return unit ? `${number} ${unitLabel(unit, quantity)}` : number;
}

/** A readable amount for a base amount: 48 tsp → "1 cup", 1500 ml → "1.5 l". */
export function formatAmount(unitKey: string, amount: number, system: UnitSystem | null): string {
  if (unitKey === "volume") {
    if (system === "metric") return amount < 1000 ? show(roundMetric(amount), "ml", true) : show(round2(amount / 1000), "l", true);
    if (amount < TO_BASE.tbsp * 0.99) return show(amount / TO_BASE.tsp, "tsp", false);
    if (amount < (TO_BASE.cup / 4) * 0.99) return show(amount / TO_BASE.tbsp, "tbsp", false);
    return show(amount / TO_BASE.cup, "cup", false);
  }
  if (unitKey === "weight") {
    if (system === "metric") return amount < 1000 ? show(roundMetric(amount), "g", true) : show(round2(amount / 1000), "kg", true);
    if (amount < TO_BASE.lb * 0.99) return show(amount / TO_BASE.oz, "oz", false);
    return show(amount / TO_BASE.lb, "lb", false);
  }
  const unit = unitKey.slice("count:".length);
  return show(amount, unit === "each" ? null : unit, false);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/units.ts lib/units.test.ts
git commit -m "Convert to base units and format readable amounts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The grocery list builder

**Files:**
- Create: `lib/grocery.ts`, `lib/grocery.test.ts`

**Interfaces:**
- Consumes: `toBase`, `unitKeyForKind`, `formatAmount`, `formatQuantity`, `unitLabel`, `UnitKind`, `UnitSystem` (Task 2); `SECTIONS`, `Section` (phase 1)
- Produces:

```ts
export type GroceryIngredient = {
  recipeTitle: string; entryServings: number; recipeServings: number;
  rawText: string; quantity: number | null; unit: string | null;
  itemId: string | null; itemName: string | null; itemSection: string | null; itemUnitKind: UnitKind | null;
};
export type GroceryMark = { key: string; checked: boolean; checkedQty: number | null; hidden: boolean };
export type GroceryExtra = { id: string; name: string; quantity: number | null; unit: string | null; section: string | null; checked: boolean };
export type GroceryLine = {
  id: string;            // unique on the page: `${key}#need`, `${key}#bought`, or the extra's key
  key: string;           // line key (see Global Constraints)
  kind: "need" | "bought" | "extra";
  name: string;
  label: string;         // "1 ½ cups flour"
  section: Section;
  recipes: string[];     // recipe titles the line is for (empty for extras)
  checked: boolean;
  hidden: boolean;
  shortfallBase: number | null; // need lines only: amount still needed, in base units
  extraId: string | null;
};
export type GroceryList = { sections: { section: Section; lines: GroceryLine[] }[]; toBuy: number; checked: number; hiddenCount: number };
export function rawKey(rawText: string): string;
export function buildGroceryList(ingredients: GroceryIngredient[], marks: GroceryMark[], extras: GroceryExtra[], opts?: { showHidden?: boolean }): GroceryList;
```

- [ ] **Step 1: Write the failing tests**

`lib/grocery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGroceryList, rawKey, type GroceryExtra, type GroceryIngredient, type GroceryMark } from "./grocery";

const FLOUR = { itemId: "i-flour", itemName: "flour", itemSection: "pantry", itemUnitKind: "volume" as const };
const MILK = { itemId: "i-milk", itemName: "milk", itemSection: "dairy & eggs", itemUnitKind: "volume" as const };
const TOMATO = { itemId: "i-tomato", itemName: "tomatoes", itemSection: "produce", itemUnitKind: "count" as const };
const SALT = { itemId: "i-salt", itemName: "salt", itemSection: "spices", itemUnitKind: "count" as const };

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
    expect(list.sections[0].lines[0]).toMatchObject({ key: "item:i-flour:volume", kind: "need", recipes: ["Bread", "Pancakes"], shortfallBase: expect.closeTo(473.176, 2) });
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

  it("renders a checked line from its mark", () => {
    const marks: GroceryMark[] = [{ key: "item:i-flour:volume", checked: true, checkedQty: 473.176, hidden: false }];
    const list = buildGroceryList([ing({ ...FLOUR, quantity: 2, unit: "cup" })], marks, []);
    expect(labels(list)).toEqual(["pantry: ✓ 2 cups flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ kind: "bought", id: "item:i-flour:volume#bought" });
    expect(list).toMatchObject({ toBuy: 0, checked: 1 });
  });

  it("shows a bought line and the remainder when the plan grows", () => {
    const marks: GroceryMark[] = [{ key: "item:i-flour:volume", checked: true, checkedQty: 473.176, hidden: false }];
    const list = buildGroceryList([ing({ ...FLOUR, quantity: 3, unit: "cup" })], marks, []);
    expect(labels(list)).toEqual(["pantry: 1 cup flour", "pantry: ✓ 2 cups flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ kind: "need", shortfallBase: expect.closeTo(236.588, 2) });
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/grocery.test.ts`
Expected: FAIL, "Cannot find module './grocery'".

- [ ] **Step 3: Implement `lib/grocery.ts`**

```ts
import { SECTIONS, type Section } from "./sections";
import { formatAmount, formatQuantity, toBase, unitKeyForKind, unitLabel, type UnitKind, type UnitSystem } from "./units";

export type GroceryIngredient = {
  recipeTitle: string;
  entryServings: number;
  recipeServings: number;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  itemId: string | null;
  itemName: string | null;
  itemSection: string | null;
  itemUnitKind: UnitKind | null;
};
export type GroceryMark = { key: string; checked: boolean; checkedQty: number | null; hidden: boolean };
export type GroceryExtra = { id: string; name: string; quantity: number | null; unit: string | null; section: string | null; checked: boolean };
export type GroceryLine = {
  id: string;
  key: string;
  kind: "need" | "bought" | "extra";
  name: string;
  label: string;
  section: Section;
  recipes: string[];
  checked: boolean;
  hidden: boolean;
  shortfallBase: number | null;
  extraId: string | null;
};
export type GroceryList = { sections: { section: Section; lines: GroceryLine[] }[]; toBuy: number; checked: number; hiddenCount: number };

type Group = {
  key: string;
  name: string;
  section: Section;
  unitKey: string;
  system: UnitSystem | null;
  required: number | null;
  recipes: Set<string>;
};

const asSection = (s: string | null): Section => ((SECTIONS as readonly string[]).includes(s ?? "") ? (s as Section) : "other");

export function rawKey(rawText: string): string {
  return `raw:${rawText.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function groupIngredients(ingredients: GroceryIngredient[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const ing of ingredients) {
    const factor = ing.recipeServings > 0 ? ing.entryServings / ing.recipeServings : 1;
    let key: string;
    let base: ReturnType<typeof toBase> | null = null;
    if (ing.itemId !== null) {
      if (ing.quantity !== null) base = toBase(ing.quantity * factor, ing.unit);
      key = `item:${ing.itemId}:${base ? base.unitKey : unitKeyForKind(ing.itemUnitKind ?? "count")}`;
    } else {
      key = rawKey(ing.rawText);
    }
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: ing.itemId !== null ? (ing.itemName ?? ing.rawText) : ing.rawText,
        section: ing.itemId !== null ? asSection(ing.itemSection) : "other",
        unitKey: base?.unitKey ?? (ing.itemId !== null ? unitKeyForKind(ing.itemUnitKind ?? "count") : "count:each"),
        system: null,
        required: null,
        recipes: new Set(),
      };
      groups.set(key, group);
    }
    group.recipes.add(ing.recipeTitle);
    if (base) {
      group.required = (group.required ?? 0) + base.amount;
      if (base.system === "metric" || group.system === null) group.system = base.system ?? group.system;
    }
  }
  return groups;
}

const labelFor = (amount: string | null, name: string) => (amount ? `${amount} ${name}` : name);

export function buildGroceryList(
  ingredients: GroceryIngredient[],
  marks: GroceryMark[],
  extras: GroceryExtra[],
  opts: { showHidden?: boolean } = {},
): GroceryList {
  const markByKey = new Map(marks.map((m) => [m.key, m]));
  const lines: GroceryLine[] = [];
  let hiddenCount = 0;

  for (const group of groupIngredients(ingredients).values()) {
    const mark = markByKey.get(group.key);
    const hidden = mark?.hidden ?? false;
    if (hidden) hiddenCount++;
    if (hidden && !opts.showHidden) continue;
    const recipes = [...group.recipes].sort();
    const common = { key: group.key, name: group.name, section: group.section, recipes, hidden, extraId: null };
    const amount = (base: number) => formatAmount(group.unitKey, base, group.system);

    if (group.required === null) {
      const checked = mark?.checked ?? false;
      lines.push({ ...common, id: `${group.key}#${checked ? "bought" : "need"}`, kind: checked ? "bought" : "need", label: group.name, checked, shortfallBase: null });
      continue;
    }
    const bought = mark?.checked ? (mark.checkedQty ?? group.required) : 0;
    const shortfall = Math.max(0, group.required - bought);
    if (mark?.checked) {
      lines.push({ ...common, id: `${group.key}#bought`, kind: "bought", label: labelFor(amount(bought), group.name), checked: true, shortfallBase: null });
    }
    if (shortfall > group.required * 1e-6) {
      lines.push({ ...common, id: `${group.key}#need`, kind: "need", label: labelFor(amount(shortfall), group.name), checked: false, shortfallBase: shortfall });
    }
  }

  for (const extra of extras) {
    const amountText =
      extra.quantity !== null ? `${formatQuantity(extra.quantity)}${extra.unit ? ` ${unitLabel(extra.unit, extra.quantity)}` : ""}` : null;
    lines.push({
      id: `extra:${extra.id}`,
      key: `extra:${extra.id}`,
      kind: "extra",
      name: extra.name,
      label: labelFor(amountText, extra.name),
      section: asSection(extra.section),
      recipes: [],
      checked: extra.checked,
      hidden: false,
      shortfallBase: null,
      extraId: extra.id,
    });
  }

  const sections = SECTIONS.map((section) => ({
    section,
    lines: lines
      .filter((l) => l.section === section)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
  })).filter((s) => s.lines.length > 0);

  const visible = sections.flatMap((s) => s.lines);
  return {
    sections,
    toBuy: visible.filter((l) => !l.checked && !l.hidden).length,
    checked: visible.filter((l) => l.checked && !l.hidden).length,
    hiddenCount,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/grocery.test.ts`
Expected: PASS. If a label differs only in rounding, fix `formatAmount` or the builder, not the expectation. The expectations are the readable-unit rules in Global Constraints.

- [ ] **Step 5: Commit**

```bash
git add lib/grocery.ts lib/grocery.test.ts
git commit -m "Build the weekly grocery list from planned meals" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Grocery tables and row-level security

**Files:**
- Modify: `db/schema.ts`, `tests/integration/rls.test.ts`
- Create: `db/migrations/0004_<generated>.sql`, `db/migrations/0005_grocery_rls.sql`

**Interfaces:**
- Produces: the Drizzle tables `groceryMarks` (`userId`, `weekStart`, `key`, `checked`, `checkedQty`, `hidden`, `updatedAt`; primary key `(userId, weekStart, key)`) and `groceryExtras` (`id`, `userId`, `weekStart`, `itemId`, `name`, `quantity`, `unit`, `checked`, `createdAt`)

- [ ] **Step 1: Write the failing RLS tests**

Add inside the `describe` in `tests/integration/rls.test.ts`:

```ts
  it("hides grocery marks and extras from other users", async () => {
    expect((await aliceDb.from("grocery_marks").insert({ user_id: alice.id, week_start: "2026-09-28", key: "raw:x", checked: true })).error).toBeNull();
    expect((await aliceDb.from("grocery_extras").insert({ user_id: alice.id, week_start: "2026-09-28", name: "paper towels" })).error).toBeNull();
    expect((await bobDb.from("grocery_marks").select("key")).data).toEqual([]);
    expect((await bobDb.from("grocery_extras").select("id")).data).toEqual([]);
  });

  it("refuses extras that point at another user's item", async () => {
    const { data: item } = await aliceDb.from("items").select("id").limit(1).single();
    const { error } = await bobDb.from("grocery_extras").insert({ user_id: bob.id, week_start: "2026-09-28", name: "egg", item_id: item!.id });
    expect(error).not.toBeNull();
  });
```

(This relies on the earlier "hides items from other users" test, which inserts Alice's `egg` item.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int tests/integration/rls.test.ts`
Expected: FAIL. The first new test errors because the tables don't exist ("Could not find the table 'public.grocery_marks'").

- [ ] **Step 3: Add the tables to `db/schema.ts`**

Add `boolean` and `primaryKey` to the `drizzle-orm/pg-core` import, then append:

```ts
export const groceryMarks = pgTable(
  "grocery_marks",
  {
    userId: uuid("user_id").notNull(),
    /** Monday of the list's week, "YYYY-MM-DD". */
    weekStart: date("week_start", { mode: "string" }).notNull(),
    /** Line key: item:<id>:<unitKey> or raw:<text> (see lib/grocery.ts). */
    key: text("key").notNull(),
    checked: boolean("checked").notNull().default(false),
    /** Amount bought, in base units (ml, g or count). Null for lines without an amount. */
    checkedQty: numeric("checked_qty", { mode: "number" }),
    hidden: boolean("hidden").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart, t.key] })],
);

export const groceryExtras = pgTable(
  "grocery_extras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    quantity: numeric("quantity", { mode: "number" }),
    unit: text("unit"),
    checked: boolean("checked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grocery_extras_user_week_idx").on(t.userId, t.weekStart)],
);
```

- [ ] **Step 4: Generate the migration, write the RLS migration, apply**

Run: `pnpm db:generate --name=grocery`, then `pnpm exec drizzle-kit generate --custom --name=grocery_rls`. Replace the contents of `db/migrations/0005_grocery_rls.sql` with:

```sql
ALTER TABLE "grocery_marks" ADD CONSTRAINT "grocery_marks_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "grocery_extras" ADD CONSTRAINT "grocery_extras_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON "grocery_marks", "grocery_extras" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "grocery_marks", "grocery_extras" TO authenticated;
--> statement-breakpoint
ALTER TABLE "grocery_marks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "grocery_extras" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "grocery_marks_owner" ON "grocery_marks" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint
-- Extras are the owner's, and may only link the owner's own items.
CREATE POLICY "grocery_extras_owner" ON "grocery_extras" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid()))
  WITH CHECK (
    "user_id" = (select auth.uid())
    AND ("item_id" IS NULL OR EXISTS (SELECT 1 FROM "items" i WHERE i."id" = "item_id" AND i."user_id" = (select auth.uid())))
  );
```

Run: `pnpm db:migrate`
Expected: both migrations apply.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:int`
Expected: PASS: all RLS, recipe and plan tests.

- [ ] **Step 6: Commit**

```bash
git add db tests/integration/rls.test.ts
git commit -m "Add grocery marks and extras tables with row-level security" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Re-parse existing recipes (★ stored item keys)

The ★ parser changes in phase 2 and in Task 1 change how existing ingredient lines are parsed and keyed. This task adds a maintenance function that re-parses every recipe's stored lines and removes items nothing uses any more, plus a one-off script to run it.

**Files:**
- Modify: `db/queries/recipes.ts` (export `insertIngredients`), `package.json`
- Create: `db/queries/maintenance.ts`, `tests/integration/maintenance.test.ts`, `scripts/reparse-ingredients.ts`

**Interfaces:**
- Consumes: `insertIngredients(tx, userId, recipeId, lines)` from `@/db/queries/recipes`, which is now exported
- Produces: `reparseIngredients(userId: string): Promise<{ recipes: number; itemsRemoved: number }>`; the script `pnpm db:reparse`

- [ ] **Step 1: Write the failing test**

`tests/integration/maintenance.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import { reparseIngredients } from "@/db/queries/maintenance";
import { createRecipe, getRecipe } from "@/db/queries/recipes";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

const users: TestUser[] = [];
afterAll(async () => {
  await Promise.all(users.map((u) => deleteTestUser(u.id)));
  await sqlClient.end();
});

describe("reparseIngredients", () => {
  it("re-links lines to the items the current parser finds and removes unused items", async () => {
    const u = await createTestUser();
    users.push(u);
    const id = await createRecipe(u.id, { title: "Chili", servings: 4, ingredients: ["2 14-ounce cans chickpeas"], steps: [], tags: [], sourceUrl: null, notes: null });
    // Simulate a row saved by an older parser: a junk item and no unit.
    const [junk] = await sqlClient<{ id: string }[]>`
      insert into items (user_id, name, key, section, unit_kind) values (${u.id}, '14-ounce cans chickpeas', '14-ounce cans chickpea', 'other', 'count') returning id`;
    await sqlClient`update recipe_ingredients set item_id = ${junk.id}, unit = null, note = null where recipe_id = ${id}`;

    expect(await reparseIngredients(u.id)).toEqual({ recipes: 1, itemsRemoved: 1 });
    const [line] = (await getRecipe(u.id, id))!.ingredients;
    expect(line).toMatchObject({ rawText: "2 14-ounce cans chickpeas", quantity: 2, unit: "can", note: "14-ounce" });
    const [item] = await sqlClient<{ key: string }[]>`select key from items where id = ${line.itemId}`;
    expect(item.key).toBe("chickpea");
    expect((await sqlClient`select 1 from items where id = ${junk.id}`).length).toBe(0);
  });

  it("only touches the given user's data", async () => {
    const [a, b] = await Promise.all([createTestUser(), createTestUser()]);
    users.push(a, b);
    await createRecipe(b.id, { title: "Soup", servings: 2, ingredients: ["1 onion"], steps: [], tags: [], sourceUrl: null, notes: null });
    expect(await reparseIngredients(a.id)).toEqual({ recipes: 0, itemsRemoved: 0 });
    expect((await sqlClient`select 1 from items where user_id = ${b.id}`).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:int tests/integration/maintenance.test.ts`
Expected: FAIL, "Cannot find package '@/db/queries/maintenance'".

- [ ] **Step 3: Implement**

In `db/queries/recipes.ts`, change `async function insertIngredients(` to `export async function insertIngredients(`.

`db/queries/maintenance.ts`:

```ts
import "server-only";
import { and, asc, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { groceryExtras, items, recipeIngredients, recipes } from "@/db/schema";
import { insertIngredients } from "./recipes";

/**
 * Re-parses every stored ingredient line of the user's recipes with the current parser and
 * re-links them to items, then deletes items nothing refers to any more.
 */
export async function reparseIngredients(userId: string): Promise<{ recipes: number; itemsRemoved: number }> {
  const recipeRows = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.userId, userId));
  for (const { id } of recipeRows) {
    await db.transaction(async (tx) => {
      const lines = await tx
        .select({ rawText: recipeIngredients.rawText })
        .from(recipeIngredients)
        .where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.userId, userId)))
        .orderBy(asc(recipeIngredients.position));
      await tx.delete(recipeIngredients).where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.userId, userId)));
      await insertIngredients(tx, userId, id, lines.map((l) => l.rawText));
    });
  }
  const removed = await db
    .delete(items)
    .where(
      and(
        eq(items.userId, userId),
        notExists(db.select({ one: sql`1` }).from(recipeIngredients).where(eq(recipeIngredients.itemId, items.id))),
        notExists(db.select({ one: sql`1` }).from(groceryExtras).where(eq(groceryExtras.itemId, items.id))),
      ),
    )
    .returning({ id: items.id });
  return { recipes: recipeRows.length, itemsRemoved: removed.length };
}
```

`scripts/reparse-ingredients.ts`:

```ts
// One-off: re-parse every user's stored ingredient lines with the current parser.
// Run with `pnpm db:reparse` (loads .env.local; run against production only on purpose).
async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Use the environment as-is.
  }
  const { sql } = await import("drizzle-orm");
  const { db, sqlClient } = await import("@/db");
  const { reparseIngredients } = await import("@/db/queries/maintenance");
  const users = await db.execute<{ user_id: string }>(sql`select distinct user_id from recipes`);
  for (const { user_id } of users) {
    const result = await reparseIngredients(user_id);
    console.log(`user ${user_id}: ${result.recipes} recipes re-parsed, ${result.itemsRemoved} unused items removed`);
  }
  await sqlClient.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Run: `pnpm add -D tsx`, and add the script to `package.json`:

```json
"db:reparse": "node --conditions=react-server --import tsx scripts/reparse-ingredients.ts"
```

(`--conditions=react-server` makes the `server-only` import in `db/index.ts` resolve to its empty server build. `tsx` resolves the `@/` paths from `tsconfig.json`.)

- [ ] **Step 4: Run the tests, then the script against the local database**

Run: `pnpm test:int`
Expected: PASS.

Run: `pnpm db:reparse`
Expected: one line per local user with recipes, for example `user …: 1 recipes re-parsed, N unused items removed`, and exit code 0.

- [ ] **Step 5: License check and commit**

Run: `pnpm licenses list --prod`. It should be unchanged, because `tsx` is a dev dependency. Add `tsx` (MIT) to the development-tools sentence in `docs/LICENSING.md`.

```bash
git add db/queries tests/integration/maintenance.test.ts scripts package.json pnpm-lock.yaml docs/LICENSING.md
git commit -m "Add re-parse maintenance for stored ingredient lines" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Grocery queries

**Files:**
- Create: `db/queries/grocery.ts`, `tests/integration/grocery.test.ts`

**Interfaces:**
- Consumes:
  - the tables (Task 4) and `buildGroceryList` and its types (Task 3)
  - `parseIngredient` (phase 1) and `resolveItems` (phase 1)
  - `addDays` (phase 2)
- Produces (in `@/db/queries/grocery`):
  - `loadWeekIngredients(userId, weekStart): Promise<GroceryIngredient[]>`: uncooked entries in the week only
  - `listMarks(userId, weekStart): Promise<GroceryMark[]>`
  - `listExtras(userId, weekStart): Promise<GroceryExtra[]>`
  - `getGroceryList(userId, weekStart, opts?: { showHidden?: boolean }): Promise<GroceryList>`
  - `checkGroceryLine(userId, weekStart, key): Promise<boolean>`: records the current shortfall; false when the key has no line still needed
  - `uncheckGroceryLine(userId, weekStart, key): Promise<void>`
  - `setGroceryLineHidden(userId, weekStart, key, hidden): Promise<void>`
  - `addGroceryExtra(userId, weekStart, text): Promise<string | null>`: null for empty text
  - `setGroceryExtraChecked(userId, id, checked): Promise<boolean>`
  - `removeGroceryExtra(userId, id): Promise<boolean>`

- [ ] **Step 1: Write the failing integration tests**

`tests/integration/grocery.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import {
  addGroceryExtra,
  checkGroceryLine,
  getGroceryList,
  removeGroceryExtra,
  setGroceryExtraChecked,
  setGroceryLineHidden,
  uncheckGroceryLine,
} from "@/db/queries/grocery";
import { addPlanEntry, setPlanEntryCooked, updatePlanEntry } from "@/db/queries/plan";
import { createRecipe } from "@/db/queries/recipes";
import type { RecipeInput } from "@/lib/recipe-input";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

const WEEK = "2026-09-28";
const recipe = (title: string, ingredients: string[], servings = 4): RecipeInput => ({ title, servings, ingredients, steps: [], tags: [], sourceUrl: null, notes: null });

const users: TestUser[] = [];
async function newUser() {
  const u = await createTestUser();
  users.push(u);
  return u;
}
afterAll(async () => {
  await Promise.all(users.map((u) => deleteTestUser(u.id)));
  await sqlClient.end();
});

async function plan(userId: string, recipeId: string, date = "2026-09-29", servings: number | null = null) {
  const id = await addPlanEntry(userId, { recipeId, date, servings, label: null });
  if (!id) throw new Error("plan failed");
  return id;
}
const labels = async (userId: string, opts?: { showHidden?: boolean }) =>
  (await getGroceryList(userId, WEEK, opts)).sections.flatMap((s) => s.lines.map((l) => `${l.checked ? "✓ " : ""}${l.label}`));

describe("grocery queries", () => {
  it("includes only this week's uncooked meals of this user", async () => {
    const [u, other] = await Promise.all([newUser(), newUser()]);
    const pancakes = await createRecipe(u.id, recipe("Pancakes", ["2 cups flour"]));
    const bread = await createRecipe(u.id, recipe("Bread", ["1 cup flour", "1 tsp salt"]));
    const cake = await createRecipe(u.id, recipe("Cake", ["3 eggs"]));
    await plan(u.id, pancakes, "2026-09-28", 2);
    await plan(u.id, bread, "2026-10-04");
    const cooked = await plan(u.id, cake, "2026-09-30");
    await setPlanEntryCooked(u.id, cooked, true);
    await plan(u.id, cake, "2026-10-05");
    const theirs = await createRecipe(other.id, recipe("Theirs", ["5 lb sugar"]));
    await plan(other.id, theirs, "2026-09-29");

    expect(await labels(u.id)).toEqual(["2 cups flour", "1 tsp salt"]);
    expect(await labels(other.id)).toEqual(["5 lb sugar"]);
  });

  it("checks a line, then shows only the additional amount after the plan grows", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, recipe("Pancakes", ["2 cups flour"]));
    const entry = await plan(u.id, r);
    const [line] = (await getGroceryList(u.id, WEEK)).sections[0].lines;
    expect(await checkGroceryLine(u.id, WEEK, line.key)).toBe(true);
    expect(await labels(u.id)).toEqual(["✓ 2 cups flour"]);

    await updatePlanEntry(u.id, entry, { servings: 6, label: null });
    expect(await labels(u.id)).toEqual(["1 cup flour", "✓ 2 cups flour"]);
    expect(await checkGroceryLine(u.id, WEEK, line.key)).toBe(true);
    expect(await labels(u.id)).toEqual(["✓ 3 cups flour"]);

    await uncheckGroceryLine(u.id, WEEK, line.key);
    expect(await labels(u.id)).toEqual(["3 cups flour"]);
  });

  it("ignores a key that is not on the list", async () => {
    const u = await newUser();
    expect(await checkGroceryLine(u.id, WEEK, "item:00000000-0000-0000-0000-000000000000:volume")).toBe(false);
    expect(await checkGroceryLine(u.id, WEEK, "raw:nothing here")).toBe(false);
    const [{ n }] = await sqlClient<{ n: number }[]>`select count(*)::int as n from grocery_marks where user_id = ${u.id}`;
    expect(n).toBe(0);
  });

  it("hides and unhides a line for the week only", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, recipe("Toast", ["2 slices bread", "Butter to taste"]));
    await plan(u.id, r);
    await plan(u.id, r, "2026-10-06");
    const list = await getGroceryList(u.id, WEEK);
    const butter = list.sections.flatMap((s) => s.lines).find((l) => l.name === "butter")!;
    await setGroceryLineHidden(u.id, WEEK, butter.key, true);
    expect(await labels(u.id)).toEqual(["2 slices bread"]);
    expect((await getGroceryList(u.id, WEEK)).hiddenCount).toBe(1);
    expect((await getGroceryList(u.id, "2026-10-05")).hiddenCount).toBe(0);
    await setGroceryLineHidden(u.id, WEEK, butter.key, false);
    expect(await labels(u.id)).toEqual(["butter", "2 slices bread"]);
  });

  it("adds, checks and removes extras, linking parsed items", async () => {
    const [u, other] = await Promise.all([newUser(), newUser()]);
    const towels = await addGroceryExtra(u.id, WEEK, "paper towels");
    const apples = await addGroceryExtra(u.id, WEEK, "2 lb apples");
    expect(await addGroceryExtra(u.id, WEEK, "   ")).toBeNull();
    expect(await labels(u.id)).toEqual(["2 lb apples", "paper towels"]);
    const list = await getGroceryList(u.id, WEEK);
    expect(list.sections.map((s) => s.section)).toEqual(["produce", "other"]);

    expect(await setGroceryExtraChecked(other.id, apples!, true)).toBe(false);
    expect(await removeGroceryExtra(other.id, towels!)).toBe(false);
    expect(await setGroceryExtraChecked(u.id, apples!, true)).toBe(true);
    expect(await removeGroceryExtra(u.id, towels!)).toBe(true);
    expect(await labels(u.id)).toEqual(["✓ 2 lb apples"]);
    expect(await setGroceryExtraChecked(u.id, "not-a-uuid", true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int tests/integration/grocery.test.ts`
Expected: FAIL, "Cannot find package '@/db/queries/grocery'".

- [ ] **Step 3: Implement `db/queries/grocery.ts`**

```ts
import "server-only";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { groceryExtras, groceryMarks, items, planEntries, recipeIngredients, recipes } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { buildGroceryList, type GroceryExtra, type GroceryIngredient, type GroceryList, type GroceryMark } from "@/lib/grocery";
import { normalizeItemName, parseIngredient } from "@/lib/ingredients";
import { resolveItems } from "./items";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadWeekIngredients(userId: string, weekStart: string): Promise<GroceryIngredient[]> {
  return db
    .select({
      recipeTitle: recipes.title,
      entryServings: planEntries.servings,
      recipeServings: recipes.servings,
      rawText: recipeIngredients.rawText,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      itemId: recipeIngredients.itemId,
      itemName: items.name,
      itemSection: items.section,
      itemUnitKind: items.unitKind,
    })
    .from(planEntries)
    .innerJoin(recipes, and(eq(recipes.id, planEntries.recipeId), eq(recipes.userId, userId)))
    .innerJoin(recipeIngredients, and(eq(recipeIngredients.recipeId, recipes.id), eq(recipeIngredients.userId, userId)))
    .leftJoin(items, and(eq(items.id, recipeIngredients.itemId), eq(items.userId, userId)))
    .where(
      and(
        eq(planEntries.userId, userId),
        gte(planEntries.date, weekStart),
        lte(planEntries.date, addDays(weekStart, 6)),
        isNull(planEntries.cookedAt),
      ),
    )
    .orderBy(asc(planEntries.date), asc(planEntries.position), asc(recipeIngredients.position));
}

export async function listMarks(userId: string, weekStart: string): Promise<GroceryMark[]> {
  return db
    .select({ key: groceryMarks.key, checked: groceryMarks.checked, checkedQty: groceryMarks.checkedQty, hidden: groceryMarks.hidden })
    .from(groceryMarks)
    .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, weekStart)));
}

export async function listExtras(userId: string, weekStart: string): Promise<GroceryExtra[]> {
  return db
    .select({
      id: groceryExtras.id,
      name: groceryExtras.name,
      quantity: groceryExtras.quantity,
      unit: groceryExtras.unit,
      section: items.section,
      checked: groceryExtras.checked,
    })
    .from(groceryExtras)
    .leftJoin(items, and(eq(items.id, groceryExtras.itemId), eq(items.userId, userId)))
    .where(and(eq(groceryExtras.userId, userId), eq(groceryExtras.weekStart, weekStart)))
    .orderBy(asc(groceryExtras.createdAt));
}

export async function getGroceryList(userId: string, weekStart: string, opts: { showHidden?: boolean } = {}): Promise<GroceryList> {
  const [ingredients, marks, extras] = await Promise.all([
    loadWeekIngredients(userId, weekStart),
    listMarks(userId, weekStart),
    listExtras(userId, weekStart),
  ]);
  return buildGroceryList(ingredients, marks, extras, opts);
}

async function upsertMark(userId: string, weekStart: string, key: string, patch: Partial<Pick<GroceryMark, "checked" | "checkedQty" | "hidden">>) {
  await db
    .insert(groceryMarks)
    .values({ userId, weekStart, key, ...patch })
    .onConflictDoUpdate({ target: [groceryMarks.userId, groceryMarks.weekStart, groceryMarks.key], set: { ...patch, updatedAt: new Date() } });
}

/** Marks the line's current shortfall as bought. The amount is always computed here, never taken from the client. */
export async function checkGroceryLine(userId: string, weekStart: string, key: string): Promise<boolean> {
  const list = await getGroceryList(userId, weekStart, { showHidden: true });
  const need = list.sections.flatMap((s) => s.lines).find((l) => l.kind === "need" && l.key === key);
  if (!need) return false;
  const [mark] = (await listMarks(userId, weekStart)).filter((m) => m.key === key);
  const already = mark?.checked ? (mark.checkedQty ?? 0) : 0;
  await upsertMark(userId, weekStart, key, { checked: true, checkedQty: need.shortfallBase === null ? null : already + need.shortfallBase });
  return true;
}

export async function uncheckGroceryLine(userId: string, weekStart: string, key: string): Promise<void> {
  await upsertMark(userId, weekStart, key, { checked: false, checkedQty: null });
}

export async function setGroceryLineHidden(userId: string, weekStart: string, key: string, hidden: boolean): Promise<void> {
  await upsertMark(userId, weekStart, key, { hidden });
}

export async function addGroceryExtra(userId: string, weekStart: string, text: string): Promise<string | null> {
  const parsed = parseIngredient(text);
  if (!parsed.raw) return null;
  return db.transaction(async (tx) => {
    const itemIds = parsed.name ? await resolveItems(tx, userId, [{ name: parsed.name, unit: parsed.unit }]) : new Map<string, string>();
    const [row] = await tx
      .insert(groceryExtras)
      .values({
        userId,
        weekStart,
        itemId: parsed.name ? (itemIds.get(normalizeItemName(parsed.name)) ?? null) : null,
        name: parsed.name ?? parsed.raw,
        quantity: parsed.name ? parsed.quantity : null,
        unit: parsed.name ? parsed.unit : null,
      })
      .returning({ id: groceryExtras.id });
    return row.id;
  });
}

export async function setGroceryExtraChecked(userId: string, id: string, checked: boolean): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .update(groceryExtras)
    .set({ checked })
    .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
    .returning({ id: groceryExtras.id });
  return rows.length > 0;
}

export async function removeGroceryExtra(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(groceryExtras)
    .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
    .returning({ id: groceryExtras.id });
  return rows.length > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:int && pnpm exec tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 5: Commit**

```bash
git add db/queries/grocery.ts tests/integration/grocery.test.ts
git commit -m "Add grocery list queries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The `/list` page

**Files:**
- Create: `page.tsx`, `actions.ts`, `grocery-lines.tsx`, `add-extra-form.tsx` and `error.tsx`, all in `app/(app)/list/`
- Modify: `components/app-nav.tsx`

**Interfaces:**
- Consumes:
  - all of `@/db/queries/grocery` (Task 6), and `GroceryLine` and `GroceryList` (Task 3)
  - `resolveWeek`, `mondayOf`, `isIsoDate`, `addDays` and `formatWeekRange` (phase 2); `getToday`, `requireUser` and `ui`
- Produces:
  - `toggleLineAction(week: string, key: string, checked: boolean): Promise<void>`
  - `hideLineAction(week: string, key: string, hidden: boolean): Promise<void>`
  - `addExtraAction(week: string, prev: AddExtraState, fd: FormData): Promise<AddExtraState>`
  - `toggleExtraAction(id: string, checked: boolean): Promise<void>`
  - `removeExtraAction(id: string): Promise<void>`

- [ ] **Step 1: The List tab and the actions**

In `components/app-nav.tsx`, change `TABS` to:

```ts
// Phase 4 adds Inventory here.
const TABS = [
  { href: "/recipes", label: "Recipes" },
  { href: "/plan", label: "Plan" },
  { href: "/list", label: "List" },
];
```

`app/(app)/list/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  addGroceryExtra,
  checkGroceryLine,
  removeGroceryExtra,
  setGroceryExtraChecked,
  setGroceryLineHidden,
  uncheckGroceryLine,
} from "@/db/queries/grocery";
import { isIsoDate, mondayOf } from "@/lib/dates";
import { requireUser } from "@/server/auth";

export type AddExtraState = { error?: string; text?: string } | null;

// Keys come from the page, so a forged one may arrive: accept only well-formed keys for a real Monday.
const validWeek = (week: unknown): week is string => typeof week === "string" && isIsoDate(week) && mondayOf(week) === week;
const validKey = (key: unknown): key is string => typeof key === "string" && key.length <= 500 && /^(item|raw):/.test(key);

export async function toggleLineAction(week: string, key: string, checked: boolean): Promise<void> {
  const user = await requireUser("/list");
  if (!validWeek(week) || !validKey(key)) return;
  if (checked === true) await checkGroceryLine(user.id, week, key);
  else await uncheckGroceryLine(user.id, week, key);
  revalidatePath("/list");
}

export async function hideLineAction(week: string, key: string, hidden: boolean): Promise<void> {
  const user = await requireUser("/list");
  if (!validWeek(week) || !validKey(key)) return;
  await setGroceryLineHidden(user.id, week, key, hidden === true);
  revalidatePath("/list");
}

export async function addExtraAction(week: string, _prev: AddExtraState, formData: FormData): Promise<AddExtraState> {
  const user = await requireUser("/list");
  const text = String(formData.get("text") ?? "").trim();
  if (!validWeek(week)) return { error: "That week isn't valid.", text };
  if (!text) return { error: "Type an item to add.", text };
  if (text.length > 200) return { error: "Keep items under 200 characters.", text };
  await addGroceryExtra(user.id, week, text);
  revalidatePath("/list");
  return null;
}

export async function toggleExtraAction(id: string, checked: boolean): Promise<void> {
  const user = await requireUser("/list");
  await setGroceryExtraChecked(user.id, id, checked === true);
  revalidatePath("/list");
}

export async function removeExtraAction(id: string): Promise<void> {
  const user = await requireUser("/list");
  await removeGroceryExtra(user.id, id);
  revalidatePath("/list");
}
```

- [ ] **Step 2: The lines component (client, optimistic)**

`app/(app)/list/grocery-lines.tsx`:

```tsx
"use client";

import { useOptimistic, useTransition } from "react";
import { ui } from "@/components/ui";
import type { GroceryLine } from "@/lib/grocery";
import { hideLineAction, removeExtraAction, toggleExtraAction, toggleLineAction } from "./actions";

type Section = { section: string; lines: GroceryLine[] };

export function GroceryLines({ week, sections }: { week: string; sections: Section[] }) {
  const [, startTransition] = useTransition();
  // Flip a line's checked state immediately; the server's re-render replaces it when the action finishes.
  const [optimistic, flip] = useOptimistic(sections, (current: Section[], id: string) =>
    current.map((s) => ({ ...s, lines: s.lines.map((l) => (l.id === id ? { ...l, checked: !l.checked } : l)) })),
  );

  function toggle(line: GroceryLine) {
    startTransition(async () => {
      flip(line.id);
      if (line.extraId) await toggleExtraAction(line.extraId, !line.checked);
      else await toggleLineAction(week, line.key, !line.checked);
    });
  }

  return (
    <div className="space-y-6">
      {optimistic.map(({ section, lines }) => (
        <section key={section} aria-labelledby={`section-${section}`}>
          <h2 id={`section-${section}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {section}
          </h2>
          <ul className={`${ui.card} divide-y divide-neutral-100 p-0 dark:divide-neutral-800`}>
            {lines.map((line) => (
              <li key={line.id} className={`flex items-center gap-3 px-4 py-3 ${line.hidden ? "opacity-50" : ""}`}>
                <input
                  id={`line-${line.id}`}
                  type="checkbox"
                  checked={line.checked}
                  onChange={() => toggle(line)}
                  className="size-5 shrink-0 accent-emerald-700"
                />
                <label htmlFor={`line-${line.id}`} className="min-w-0 flex-1">
                  <span className={line.checked ? "text-neutral-500 line-through" : ""}>{line.label}</span>
                  {line.recipes.length > 0 && <span className="block truncate text-xs text-neutral-500">for {line.recipes.join(", ")}</span>}
                </label>
                {line.extraId ? (
                  <form action={removeExtraAction.bind(null, line.extraId)}>
                    <button type="submit" aria-label={`Remove ${line.name}`} className="text-sm text-neutral-500 hover:underline">
                      Remove
                    </button>
                  </form>
                ) : (
                  <form action={hideLineAction.bind(null, week, line.key, !line.hidden)}>
                    <button type="submit" aria-label={`${line.hidden ? "Unhide" : "Hide"} ${line.name}`} className="text-sm text-neutral-500 hover:underline">
                      {line.hidden ? "Unhide" : "Hide"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: The add-extra form, the page and the error page**

`app/(app)/list/add-extra-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { AddExtraState } from "./actions";

export function AddExtraForm({ action }: { action: (prev: AddExtraState, formData: FormData) => Promise<AddExtraState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mb-6 flex gap-2" noValidate>
      <label htmlFor="extra-text" className="sr-only">
        Add an item
      </label>
      <input
        id="extra-text"
        name="text"
        placeholder="Add an item, e.g. paper towels or 2 lb apples"
        defaultValue={state?.text ?? ""}
        aria-invalid={!!state?.error}
        aria-describedby={state?.error ? "extra-error" : undefined}
        className={`${ui.input} mt-0`}
      />
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state?.error && (
        <p id="extra-error" role="alert" className={`${ui.error} w-full`}>
          {state.error}
        </p>
      )}
    </form>
  );
}
```

`app/(app)/list/page.tsx`:

```tsx
import Link from "next/link";
import { ui } from "@/components/ui";
import { getGroceryList } from "@/db/queries/grocery";
import { addDays, formatWeekRange, mondayOf, resolveWeek } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getToday } from "@/server/today";
import { addExtraAction } from "./actions";
import { AddExtraForm } from "./add-extra-form";
import { GroceryLines } from "./grocery-lines";

export default async function ListPage(props: PageProps<"/list">) {
  const user = await requireUser("/list");
  const params = await props.searchParams;
  const today = await getToday();
  const week = resolveWeek(typeof params.week === "string" ? params.week : undefined, today);
  const showHidden = params.hidden === "1";
  const list = await getGroceryList(user.id, week, { showHidden });
  const weekQuery = (w: string, extra = "") => `/list?week=${w}${extra}`;

  return (
    <main className={ui.page}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={ui.h1}>Grocery list</h1>
        <p className="text-neutral-600 dark:text-neutral-400" aria-live="polite">
          Week of {formatWeekRange(week)} · {list.toBuy} to buy{list.checked > 0 ? ` · ${list.checked} checked` : ""}
        </p>
      </div>
      <nav aria-label="Weeks" className="mb-4 flex gap-2">
        <Link href={weekQuery(addDays(week, -7))} className={ui.buttonSecondary}>
          ← Previous
        </Link>
        {week !== mondayOf(today) && (
          <Link href="/list" className={ui.buttonSecondary}>
            This week
          </Link>
        )}
        <Link href={weekQuery(addDays(week, 7))} className={ui.buttonSecondary}>
          Next →
        </Link>
      </nav>

      <AddExtraForm action={addExtraAction.bind(null, week)} />

      {list.sections.length === 0 ? (
        <div className={`${ui.card} text-center`}>
          <p>
            Nothing to buy this week.{" "}
            <Link href={`/plan?week=${week}`} className="text-emerald-700 underline dark:text-emerald-400">
              Plan some meals
            </Link>{" "}
            to build your list.
          </p>
        </div>
      ) : (
        <GroceryLines week={week} sections={list.sections} />
      )}

      {list.hiddenCount > 0 && (
        <p className="mt-6 text-sm">
          <Link href={showHidden ? weekQuery(week) : weekQuery(week, "&hidden=1")} className="text-neutral-600 underline dark:text-neutral-400">
            {showHidden ? "Hide hidden items" : `Show hidden (${list.hiddenCount})`}
          </Link>
        </p>
      )}
    </main>
  );
}
```

`app/(app)/list/error.tsx`: the same as `app/(app)/plan/error.tsx`, with the component named `ListError` and the message "We couldn’t load your grocery list.":

```tsx
"use client";

import { useEffect } from "react";
import { ui } from "@/components/ui";

export default function ListError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>Something went wrong</h1>
      <p className="mt-2">We couldn’t load your grocery list.</p>
      <button type="button" onClick={() => retry()} className={`${ui.button} mt-4`}>
        Try again
      </button>
    </main>
  );
}
```

- [ ] **Step 4: Type-check, lint, unit tests, and a screenshot check**

Run: `pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all clean.

Visual check without touching the owner's running server. Run the e2e server's build folder with an `@example.test` allowlist on port 3100:

```bash
NEXT_DIST_DIR=.next-e2e ALLOWED_EMAILS=@example.test pnpm exec next dev --port 3100
```

Sign in a test user with the admin magic-link approach from `tests/e2e/helpers.ts`, plan two recipes that share flour, and screenshot `/list` at 375 px wide. Check that the sections, checkboxes and Hide buttons fit on screen without scrolling sideways. Stop the server afterwards.

- [ ] **Step 5: Commit**

```bash
git add components/app-nav.tsx "app/(app)/list"
git commit -m "Add the grocery list page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end tests

**Files:**
- Create: `tests/e2e/list.spec.ts`

**Interfaces:**
- Consumes: `signInAsNewUser`, `deleteUser`, `createRecipeViaUi` (`tests/e2e/helpers.ts`)

- [ ] **Step 1: Write the tests**

`tests/e2e/list.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "./helpers";

test.use({ timezoneId: "America/Los_Angeles" });

async function planForToday(page: Page, recipeUrl: string, servings?: string) {
  await page.goto(recipeUrl);
  if (servings) await page.getByLabel("Servings", { exact: true }).fill(servings);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
}

const line = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });

test.describe("grocery list", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("merges planned recipes, checks off, and shows only the extra amount after the plan grows", async ({ page }) => {
    const pancakes = await createRecipeViaUi(page, "Pancakes", 4, "2 cups flour\n1 cup milk");
    const bread = await createRecipeViaUi(page, "Bread", 2, "1 cup flour\nFor the dough:");
    await planForToday(page, pancakes);
    await planForToday(page, bread);

    await page.getByRole("link", { name: "List", exact: true }).click();
    await expect(line(page, "3 cups flour")).toContainText("for Bread, Pancakes");
    await expect(line(page, "1 cup milk")).toBeVisible();
    await expect(line(page, "For the dough:")).toBeVisible();

    await line(page, "3 cups flour").getByRole("checkbox").check();
    await expect(line(page, "3 cups flour").getByRole("checkbox")).toBeChecked();
    await page.reload();
    await expect(line(page, "3 cups flour").getByRole("checkbox")).toBeChecked();

    await planForToday(page, pancakes, "2");
    await page.goto("/list");
    await expect(line(page, /^1 cup flour/).getByRole("checkbox")).not.toBeChecked();
    await expect(line(page, "3 cups flour").getByRole("checkbox")).toBeChecked();
  });

  test("hides items for the week and adds extras", async ({ page }) => {
    const soup = await createRecipeViaUi(page, "Soup", 2, "1 onion\nSalt to taste");
    await planForToday(page, soup);
    await page.goto("/list");

    await page.getByRole("button", { name: "Hide salt" }).click();
    await expect(line(page, "salt")).toHaveCount(0);
    await page.getByRole("link", { name: "Show hidden (1)" }).click();
    await page.getByRole("button", { name: "Unhide salt" }).click();
    await page.goto("/list");
    await expect(line(page, "salt")).toBeVisible();

    await page.getByLabel("Add an item").fill("paper towels");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(line(page, "paper towels")).toBeVisible();
    await line(page, "paper towels").getByRole("checkbox").check();
    await expect(line(page, "paper towels").getByRole("checkbox")).toBeChecked();
    await page.getByRole("button", { name: "Remove paper towels" }).click();
    await expect(line(page, "paper towels")).toHaveCount(0);

    await page.getByRole("button", { name: "Add", exact: true }).click();
    // Next's route announcer also has role="alert", so pick ours by its text.
    await expect(page.getByRole("alert").filter({ hasText: "Type an item to add." })).toBeVisible();
  });

  test("an empty week points to the plan", async ({ page }) => {
    await page.goto("/list?week=2026-10-05");
    await expect(page.getByText("Nothing to buy this week.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan some meals" })).toHaveAttribute("href", "/plan?week=2026-10-05");
  });
});
```

- [ ] **Step 2: Run the e2e tests**

Run: `pnpm test:e2e`
Expected: PASS: the 13 earlier tests and these 3. If a check-off assertion flickers because of the optimistic update, wait for the checkbox's settled state with `toBeChecked()` (already used). Don't add sleeps.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/list.spec.ts
git commit -m "Add grocery list end-to-end tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs and final checks

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md` (and `docs/LICENSING.md` was already updated in Task 5)

- [ ] **Step 1: Roadmap**

- In the phase table, split phase 3: "3a Grocery list: In review (PR link)" and "3b Offline list: Next".
- Remove the four ★ parser and stored-key backlog items fixed in Tasks 1 and 5.
- Log anything deferred during this phase in the Backlog.

- [ ] **Step 2: Changelog**

Under `## [Unreleased]`, add a "Phase 3a, grocery list" block:
- **Added:** `/list` built from the week's uncooked meals, with scaling, merging, readable units and store sections; instant check-offs; hide for the week; extras; the List tab; `pnpm db:reparse`.
- **Fixed:** the parser changes from Task 1.

- [ ] **Step 3: Decisions**

Append to `docs/DECISIONS.md`:

```markdown
### D17. Grocery line keys include the count unit
A line's key is `item:<id>:<unitKey>`, where `unitKey` is `volume`, `weight` or `count:<unit|each>`. Unparsed lines use `raw:<text>`, and extras use `extra:<id>`.
**Why:** "1 can tomatoes" and "3 tomatoes" can't be added together; spec §3's `(item, unit_kind)` key would merge them into a wrong total.
**Cost:** the same item can appear on two count lines ("1 can", "3").

### D18. Before inventory, a checked amount means "bought this week"
Until phase 4, `shortfall = required − checked_qty` for the line's mark. Phase 4 replaces this with inventory, and checking off adds to inventory instead; the result is the same.
**Why:** it gives the spec's "plan grows after shopping" behavior now.
**Cost:** phase 4 must migrate checked marks into inventory, or start the current week fresh.

### D19. Readable grocery units follow the recipes' system
A merged line is shown in metric if any contributing ingredient used a metric unit, otherwise in US units, using the fixed ladders in the phase 3a plan (tsp, tbsp, cup; oz, lb; ml, l; g, kg).
**Why:** predictable output without per-user settings.
**Cost:** a mostly-US week with one metric recipe shows that item in metric.

### D20. Offline support is its own plan (phase 3b)
**Why:** the IndexedDB queue and service worker carry different risks, and spec §7 lets them slip.
**Cost:** the list needs a connection until 3b ships.
```

- [ ] **Step 4: Full verification and commit**

Run: `pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e && pnpm build && pnpm licenses list --prod`
Expected: all green, and the license list unchanged.

```bash
git add docs
git commit -m "Docs for phase 3a: roadmap, changelog and decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
