# Phase 4: Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track what's on hand, and keep it current automatically:
- **The grocery list subtracts on-hand amounts.**
- **Checking an item off adds it to inventory, and unchecking removes it.**
- **Marking a meal cooked takes its ingredients out of inventory,** and marking it not cooked puts back exactly what was taken.
- **An `/inventory` page** lets you add, edit and remove stock by hand.
- **A checked line's bought amount can be changed.**

This also clears the two ★ backlog items for phase 4:
- moving phase 3's checked marks into inventory (D18);
- making the re-parse script's "unused item" check aware of inventory.

**Architecture:**
- **Pure logic in `lib/inventory.ts`:** stock keys, what cooking deducts, and parsing typed amounts like "3 cups".
- **The list builder (`lib/grocery.ts`) takes inventory as an input.** The shortfall becomes `required − on hand`, replacing D18's `required − checked_qty`.
- **One new table, `inventory`,** keyed `(user_id, item_id, unit_key)`. It uses the same unit keys as grocery lines (D17) and stores quantities in base units.
- **Every inventory change happens inside the same transaction as the mark, extra or plan-entry change that causes it,** and each change is applied only once (idempotent). So the offline sync path from phase 3b picks up inventory without any changes of its own.

**Tech Stack:** as before. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-27-foodini-meal-planner-design.md`. This plan covers:
- §3: `inventory`, and `plan_entries.deducted`;
- §4: `/inventory` and the Inventory tab;
- §5: generating the list with inventory, special lines, checking off with inventory, and cooking.

Earlier plans in `docs/superpowers/plans/`, and D17–D25, describe the code this builds on.

## Global Constraints

- All earlier Global Constraints still apply:
  - Next 16 conventions; run `pnpm exec next typegen` after adding a route.
  - No `use cache`.
  - `requireUser` and `userId` filtering in every query.
  - Plan dates go through `lib/dates.ts`.
  - `pnpm`, and the commit trailer.
- **AGENTS.md rules:**
  - Deferred work goes in the ROADMAP Backlog.
  - Run `pnpm licenses list --prod` before the PR. Since pnpm 12 its counts differ from `LICENSING.md`, which is an open Legal backlog item; just confirm nothing new appears.
  - Builds for verification use `NEXT_DIST_DIR=.next-ci pnpm build` (then `git checkout -- tsconfig.json` and delete `.next-ci`), so they never touch `.next`.
- **Stock key:**
  - `<item_id>|<unitKey>`, where `unitKey` is a grocery line's unit key: `volume`, `weight`, or `count:<unit|each>`.
  - Quantities are stored in base units: ml, g, or a count.
  - `inventory.system` (`us`, `metric` or null) records how to display the amount.
  - A row whose quantity reaches 0 is deleted.
- **Shortfall:** `max(0, required − on_hand(item, unitKey))`.
  - Stock under a *different* unit key for the same item never subtracts. Instead, the need line gets the hint "you have 5 cups".
  - An amount-less line ("salt to taste") whose item has any stock gets the hint "have some" and is dimmed, but not hidden.
- **Checked lines are rendered from the mark,** as before.
  - Checking adds the line's shortfall to the mark's `checked_qty` and to inventory.
  - Unchecking subtracts the mark's `checked_qty` from inventory (floored at 0) and clears the mark.
  - Checking a line that isn't needed, or unchecking one that isn't checked, does nothing. That makes repeated or re-sent changes safe.
- **Extras** that are linked to an item and have an amount add it to inventory when checked, and remove it when unchecked, only when the checked state actually changes. Removing a checked extra leaves inventory alone, because you did buy it.
- **Cooking:**
  - `deducted` is `{ "<item_id>|<unitKey>": take }`, where `take = min(scaled need, on hand)` per key.
  - Marking cooked records it and subtracts it. Marking not cooked adds back exactly `deducted`.
  - Cooking an already-cooked meal, or un-cooking an uncooked one, does nothing.
- **Changing a bought amount** happens on a checked line (online only): it sets `checked_qty` and moves inventory by the difference. This realizes spec §5's "the quantity can be edited". Record it in DECISIONS.md.
- **Typed amounts** ("3 cups", "500 g", "2", "3 cloves") are parsed by `amountForKey(text, unitKey)`. The amount must be the same kind as the row or line. A bare number is accepted for any count key.
- **Data migration:** the inventory migration adds each user's checked marks (item lines with an amount) from the current and future weeks to inventory. Older weeks are treated as used up, and extras aren't migrated. Record this in DECISIONS.md.

## Review Focus

1. **The exact round trip:** buy → cook → uncook → uncheck returns inventory to exactly where it started (a spec §1 success criterion). Tests: Task 4 `the buy → cook → uncook → uncheck round trip is exact`; Task 8 e2e.
2. **Repeated changes** (a check-off synced twice, uncheck twice, cook twice) never add to or take from inventory twice. Tests: Task 4 `checking and unchecking twice changes inventory once`; Task 5 `cooking or un-cooking twice does nothing the second time`.
3. **Cooking with partial stock** takes only what's there, never goes negative, and un-cooking restores exactly that amount. Test: Task 5 `takes only what's on hand and restores exactly that`.
4. **Different unit kinds** (stock in cups, recipe in grams) never subtract from each other. The list shows the hint instead. Tests: Task 2 `never subtracts across unit kinds, and says what you have`; Task 8 e2e.
5. **Another user's inventory** can't be read or changed, and inventory rows can only point at your own items. Tests: Task 3 RLS tests; Task 4 `never touches another user's inventory`.

---

## File Structure

```
lib/inventory.ts (+ test)          stockKey, stockMap, planDeductions, amountForKey, InventoryEntry
lib/grocery.ts (+ test)            (modify) inventory-aware shortfall, hints, parseLineKey, line system
db/schema.ts                       (modify) inventory table
db/migrations/0007_*.sql, 0008_inventory_rls_and_backfill.sql
db/queries/inventory.ts            listInventory, getStock, adjustInventory, addStockFromText,
                                   setStockAmount, removeStock
db/queries/grocery.ts              (modify) inventory in getGroceryList; check/uncheck/extras/bought amount
db/queries/plan.ts                 (modify) setPlanEntryCooked deducts and restores
db/queries/maintenance.ts          (modify) ★ keep items used by inventory or deductions
app/(app)/inventory/page.tsx, actions.ts, stock-forms.tsx, error.tsx
app/(app)/list/grocery-lines.tsx   (modify) hints, dimmed lines, "Change amount"
app/(app)/list/bought-amount-form.tsx, actions.ts (modify)
components/app-nav.tsx             (modify) Inventory tab
tests/integration/inventory.test.ts, inventory-migration.test.ts, rls.test.ts (modify),
  maintenance.test.ts (modify), plan.test.ts (modify)
tests/e2e/inventory.spec.ts
docs/ ROADMAP.md, CHANGELOG.md, DECISIONS.md
```

---

### Task 1: Pure inventory logic

**Files:**
- Create: `lib/inventory.ts`, `lib/inventory.test.ts`

**Interfaces:**
- Consumes: `parseIngredient` (`lib/ingredients.ts`); `toBase`, `matchUnit`, `UnitSystem` (`lib/units.ts`)
- Produces:

```ts
export type InventoryEntry = { itemId: string; unitKey: string; quantity: number; system: UnitSystem | null };
export function stockKey(itemId: string, unitKey: string): string;            // "<itemId>|<unitKey>"
export function splitStockKey(key: string): { itemId: string; unitKey: string } | null;
export function stockMap(entries: InventoryEntry[]): Map<string, number>;
export function planDeductions(
  ingredients: { itemId: string | null; quantity: number | null; unit: string | null }[],
  factor: number,
  stock: Map<string, number>,
): Record<string, number>;
export function amountForKey(text: string, unitKey: string): { amount: number; system: UnitSystem | null } | null;
```

- [ ] **Step 1: Write the failing tests**

`lib/inventory.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/inventory.test.ts`
Expected: FAIL, "Cannot find module './inventory'".

- [ ] **Step 3: Implement `lib/inventory.ts`**

```ts
import { parseIngredient } from "./ingredients";
import { matchUnit, toBase, type UnitSystem } from "./units";

export type InventoryEntry = { itemId: string; unitKey: string; quantity: number; system: UnitSystem | null };

/** Inventory and deductions are keyed like grocery lines (D17): one item, one unit key. */
export function stockKey(itemId: string, unitKey: string): string {
  return `${itemId}|${unitKey}`;
}

export function splitStockKey(key: string): { itemId: string; unitKey: string } | null {
  const bar = key.indexOf("|");
  if (bar <= 0 || bar === key.length - 1) return null;
  return { itemId: key.slice(0, bar), unitKey: key.slice(bar + 1) };
}

export function stockMap(entries: InventoryEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = stockKey(e.itemId, e.unitKey);
    map.set(key, (map.get(key) ?? 0) + e.quantity);
  }
  return map;
}

/** What cooking takes, per stock key: the scaled need, capped at what's on hand. Untracked lines take nothing. */
export function planDeductions(
  ingredients: { itemId: string | null; quantity: number | null; unit: string | null }[],
  factor: number,
  stock: Map<string, number>,
): Record<string, number> {
  const needed = new Map<string, number>();
  for (const ing of ingredients) {
    if (ing.itemId === null || ing.quantity === null) continue;
    const base = toBase(ing.quantity * factor, ing.unit);
    const key = stockKey(ing.itemId, base.unitKey);
    needed.set(key, (needed.get(key) ?? 0) + base.amount);
  }
  const deductions: Record<string, number> = {};
  for (const [key, amount] of needed) {
    const take = Math.min(amount, stock.get(key) ?? 0);
    if (take > 0) deductions[key] = take;
  }
  return deductions;
}

/**
 * Reads a typed amount ("3 cups", "500 g", "2", "3 cloves") for a row or line with `unitKey`.
 * Returns null when it isn't a positive amount of the same kind. A bare number counts for any count key.
 */
export function amountForKey(text: string, unitKey: string): { amount: number; system: UnitSystem | null } | null {
  const parsed = parseIngredient(text);
  if (parsed.quantity === null || parsed.quantity <= 0) return null;
  let unit = parsed.unit;
  if (parsed.name !== null) {
    // "3 cloves" parses as the item "cloves"; accept it only if the whole name is a unit.
    const words = parsed.name.split(" ");
    const match = matchUnit(words);
    if (!match || match.consumed !== words.length || unit !== null) return null;
    unit = match.unit;
  }
  if (unit === null && unitKey.startsWith("count:")) return { amount: parsed.quantity, system: null };
  const base = toBase(parsed.quantity, unit);
  return base.unitKey === unitKey ? { amount: base.amount, system: base.system } : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/inventory.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/inventory.ts lib/inventory.test.ts
git commit -m "Add pure inventory logic: stock keys, deductions, typed amounts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The grocery list subtracts inventory

**Files:**
- Modify: `lib/grocery.ts`, `lib/grocery.test.ts`

**Interfaces:**
- Consumes: `InventoryEntry`, `stockKey`, `stockMap` (Task 1)
- Changes:
  - `buildGroceryList(ingredients, marks, extras, opts?: { showHidden?: boolean; inventory?: InventoryEntry[] })`
  - `GroceryLine` gains `hint: string | null`, `dimmed: boolean` and `system: UnitSystem | null`
- Produces: `parseLineKey(key: string): { itemId: string; unitKey: string } | null`, for `item:<id>:<unitKey>` keys

- [ ] **Step 1: Update and add tests (failing)**

In `lib/grocery.test.ts`:
- Change the import to also bring in `parseLineKey`, and add `import type { InventoryEntry } from "./inventory";`.
- Add the constant `const stock = (itemId: string, unitKey: string, quantity: number, system: InventoryEntry["system"] = "us"): InventoryEntry => ({ itemId, unitKey, quantity, system });`.

Replace the test "renders a checked line from its mark" with:

```ts
  it("renders a checked line from its mark when inventory covers it", () => {
    const marks: GroceryMark[] = [{ key: "item:i-flour:volume", checked: true, checkedQty: 473.176, hidden: false }];
    const list = buildGroceryList([ing({ ...FLOUR, quantity: 2, unit: "cup" })], marks, [], { inventory: [stock("i-flour", "volume", 473.176)] });
    expect(labels(list)).toEqual(["pantry: ✓ 2 cups flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ kind: "bought", id: "item:i-flour:volume" });
    expect(list).toMatchObject({ toBuy: 0, checked: 1 });
  });
```

Replace "shows a bought line and the remainder when the plan grows" with:

```ts
  it("shows a bought line and the remainder when the plan grows", () => {
    const marks: GroceryMark[] = [{ key: "item:i-flour:volume", checked: true, checkedQty: 473.176, hidden: false }];
    const list = buildGroceryList([ing({ ...FLOUR, quantity: 3, unit: "cup" })], marks, [], { inventory: [stock("i-flour", "volume", 473.176)] });
    expect(labels(list)).toEqual(["pantry: 1 cup flour", "pantry: ✓ 2 cups flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ kind: "need", id: "item:i-flour:volume#more", shortfallBase: expect.closeTo(236.588, 2) });
    expect(list.sections[0].lines[1]).toMatchObject({ kind: "bought", id: "item:i-flour:volume" });
  });
```

Add these tests inside `describe("buildGroceryList", …)`:

```ts
  it("subtracts what's on hand and leaves out lines you already have", () => {
    const ings = [ing({ ...FLOUR, quantity: 3, unit: "cup" }), ing({ ...MILK, quantity: 1, unit: "cup" })];
    const list = buildGroceryList(ings, [], [], { inventory: [stock("i-flour", "volume", 473.176), stock("i-milk", "volume", 500)] });
    expect(labels(list)).toEqual(["pantry: 1 cup flour"]);
  });

  it("never subtracts across unit kinds, and says what you have", () => {
    const list = buildGroceryList([ing({ ...FLOUR, itemUnitKind: "weight", quantity: 200, unit: "g" })], [], [], {
      inventory: [stock("i-flour", "volume", 473.176)],
    });
    expect(labels(list)).toEqual(["pantry: 200 g flour"]);
    expect(list.sections[0].lines[0]).toMatchObject({ hint: "you have 2 cups", dimmed: false });
  });

  it("marks an amount-less line 'have some' when the item is in stock", () => {
    const list = buildGroceryList([ing({ ...SALT, rawText: "Salt to taste" })], [], [], { inventory: [stock("i-salt", "volume", 5)] });
    expect(labels(list)).toEqual(["spices: salt"]);
    expect(list.sections[0].lines[0]).toMatchObject({ hint: "have some", dimmed: true, checked: false });
  });

  it("carries the display system on need lines", () => {
    const list = buildGroceryList([ing({ ...FLOUR, itemUnitKind: "weight", quantity: 200, unit: "g" })], [], []);
    expect(list.sections[0].lines[0]).toMatchObject({ system: "metric", hint: null, dimmed: false });
  });
```

And a new `describe` block:

```ts
describe("parseLineKey", () => {
  it("splits item keys and rejects others", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseLineKey(`item:${id}:count:can`)).toEqual({ itemId: id, unitKey: "count:can" });
    expect(parseLineKey(`item:${id}:volume`)).toEqual({ itemId: id, unitKey: "volume" });
    expect(parseLineKey("raw:for the sauce:")).toBeNull();
    expect(parseLineKey("item:not-an-id:volume")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/grocery.test.ts`
Expected: FAIL. The new and changed tests fail (no inventory option, no `hint`/`dimmed`/`system`, no `parseLineKey`). Tests that don't involve inventory still pass.

- [ ] **Step 3: Implement in `lib/grocery.ts`**

1. Add the imports `import { stockKey, stockMap, type InventoryEntry } from "./inventory";`, and add `UnitSystem` to the existing units import if it isn't there yet.
2. In `GroceryLine`, add:
   ```ts
     /** "have some" or "you have 5 cups": stock that didn't reduce this line. */
     hint: string | null;
     /** An amount-less line whose item is in stock: still listed, but de-emphasized. */
     dimmed: boolean;
     /** Display system of the line's amount, used when it's added to inventory. */
     system: UnitSystem | null;
   ```
3. In `Group`, add `itemId: string | null;`, and set it in `groupIngredients` when a group is created: `itemId: ing.itemId,`.
4. Add the following, and export `parseLineKey`:
   ```ts
   const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

   /** `item:<item_id>:<unitKey>` → its parts; null for raw and extra keys. */
   export function parseLineKey(key: string): { itemId: string; unitKey: string } | null {
     if (!key.startsWith("item:")) return null;
     const itemId = key.slice(5, 41);
     const unitKey = key.slice(42);
     return UUID.test(itemId) && key[41] === ":" && unitKey ? { itemId, unitKey } : null;
   }
   ```
   Note that the unit-test item ids (`i-flour`, …) aren't UUIDs. That's fine, because the builder uses `group.itemId` directly, not `parseLineKey`.
5. In `buildGroceryList`, change `opts` to `opts: { showHidden?: boolean; inventory?: InventoryEntry[] } = {}`. Before the group loop, add:
   ```ts
     const inventory = (opts.inventory ?? []).filter((e) => e.quantity > 0);
     const onHand = stockMap(inventory);
   ```
   Replace the body of the group loop, from `const recipes = …` to the end of the loop, with:
   ```ts
       const recipes = [...group.recipes].sort();
       const have = group.itemId !== null ? (onHand.get(stockKey(group.itemId, group.unitKey)) ?? 0) : 0;
       const otherStock = group.itemId !== null ? inventory.filter((e) => e.itemId === group.itemId && e.unitKey !== group.unitKey) : [];
       const common = { key: group.key, name: group.name, section: group.section, recipes, hidden, extraId: null, system: group.system };
       const amount = (base: number) => formatAmount(group.unitKey, base, group.system);

       if (group.required === null) {
         const checked = mark?.checked ?? false;
         const haveSome = !checked && (have > 0 || otherStock.length > 0);
         lines.push({
           ...common,
           id: group.key,
           kind: checked ? "bought" : "need",
           label: group.name,
           checked,
           shortfallBase: null,
           hint: haveSome ? "have some" : null,
           dimmed: haveSome,
         });
         continue;
       }
       // Bought amounts are in inventory (phase 4), so the shortfall comes from stock, not from the mark (D18 → D27).
       const shortfall = Math.max(0, group.required - have);
       if (mark?.checked) {
         const bought = mark.checkedQty ?? group.required;
         lines.push({ ...common, id: group.key, kind: "bought", label: labelFor(amount(bought), group.name), checked: true, shortfallBase: null, hint: null, dimmed: false });
       }
       if (shortfall > group.required * 1e-6) {
         const hint = have === 0 && otherStock.length > 0 ? `you have ${otherStock.map((e) => formatAmount(e.unitKey, e.quantity, e.system)).join(", ")}` : null;
         lines.push({
           ...common,
           id: mark?.checked ? `${group.key}#more` : group.key,
           kind: "need",
           label: labelFor(amount(shortfall), group.name),
           checked: false,
           shortfallBase: shortfall,
           hint,
           dimmed: false,
         });
       }
   ```
6. In the extras loop's `lines.push({ … })`, add `hint: null, dimmed: false, system: null,`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: unit tests PASS. `tsc` reports errors only where `GroceryLine` objects are built outside `lib/grocery.ts`, if any. Fix those by adding the three fields.

- [ ] **Step 5: Commit**

```bash
git add lib/grocery.ts lib/grocery.test.ts
git commit -m "Grocery list: subtract inventory, hint at other stock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The `inventory` table, RLS, backfill, and the ★ re-parse check

**Files:**
- Modify: `db/schema.ts`, `db/queries/maintenance.ts`, `tests/integration/rls.test.ts`, `tests/integration/maintenance.test.ts`
- Create: `db/migrations/0007_<generated>.sql`, `db/migrations/0008_inventory_rls_and_backfill.sql`, `tests/integration/inventory-migration.test.ts`

**Interfaces:**
- Produces: the Drizzle table `inventory` (`userId`, `itemId`, `unitKey`, `quantity`, `system`, `updatedAt`; primary key `(userId, itemId, unitKey)`)

- [ ] **Step 1: Write the failing tests**

In `tests/integration/rls.test.ts`, add inside the `describe` (after "refuses extras that point at another user's item"):

```ts
  it("hides inventory from other users and refuses another user's item", async () => {
    const { data: item } = await aliceDb.from("items").select("id").limit(1).single();
    expect((await aliceDb.from("inventory").insert({ user_id: alice.id, item_id: item!.id, unit_key: "count:each", quantity: 3 })).error).toBeNull();
    expect((await bobDb.from("inventory").select("item_id")).data).toEqual([]);
    expect((await bobDb.from("inventory").insert({ user_id: bob.id, item_id: item!.id, unit_key: "count:each", quantity: 1 })).error).not.toBeNull();
  });
```

In `tests/integration/maintenance.test.ts`, add:

```ts
  it("keeps items that inventory or a cooked meal still refers to", async () => {
    const u = await createTestUser();
    users.push(u);
    const [kept] = await sqlClient<{ id: string }[]>`
      insert into items (user_id, name, key, section, unit_kind) values (${u.id}, 'saffron', 'saffron', 'spices', 'weight') returning id`;
    await sqlClient`insert into inventory (user_id, item_id, unit_key, quantity) values (${u.id}, ${kept.id}, 'weight', 1)`;
    const [deducted] = await sqlClient<{ id: string }[]>`
      insert into items (user_id, name, key, section, unit_kind) values (${u.id}, 'sumac', 'sumac', 'spices', 'weight') returning id`;
    const recipeId = await createRecipe(u.id, { title: "Stew", servings: 2, ingredients: ["1 onion"], steps: [], tags: [], sourceUrl: null, notes: null });
    await sqlClient`
      insert into plan_entries (user_id, date, position, recipe_id, servings, cooked_at, deducted)
      values (${u.id}, '2026-10-12', 0, ${recipeId}, 2, now(), ${sqlClient.json({ [`${deducted.id}|weight`]: 3 })})`;
    expect((await reparseIngredients(u.id)).itemsRemoved).toBe(0);
    expect((await sqlClient`select 1 from items where id in (${kept.id}, ${deducted.id})`).length).toBe(2);
  });
```

`tests/integration/inventory-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import { mondayOf, addDays, todayIn } from "@/lib/dates";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

// The backfill statement from the migration, run inside a rolled-back transaction so no other data changes.
const BACKFILL = readFileSync("db/migrations/0008_inventory_rls_and_backfill.sql", "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .find((s) => s.includes('INSERT INTO "inventory"'))!;

const users: TestUser[] = [];
afterAll(async () => {
  await Promise.all(users.map((u) => deleteTestUser(u.id)));
  await sqlClient.end();
});

class Rollback extends Error {}

describe("inventory backfill migration", () => {
  it("moves checked item marks of current and future weeks into inventory", async () => {
    const u = await createTestUser();
    users.push(u);
    const thisWeek = mondayOf(todayIn(undefined));
    const lastWeek = addDays(thisWeek, -7);
    const [flour] = await sqlClient<{ id: string }[]>`
      insert into items (user_id, name, key, section, unit_kind) values (${u.id}, 'flour', 'flour', 'pantry', 'volume') returning id`;
    let rows: { unit_key: string; quantity: number }[] = [];
    await sqlClient
      .begin(async (sql) => {
        await sql`insert into grocery_marks (user_id, week_start, key, checked, checked_qty) values
          (${u.id}, ${thisWeek}, ${`item:${flour.id}:volume`}, true, 100),
          (${u.id}, ${addDays(thisWeek, 7)}, ${`item:${flour.id}:volume`}, true, 50),
          (${u.id}, ${lastWeek}, ${`item:${flour.id}:volume`}, true, 999),
          (${u.id}, ${thisWeek}, ${`item:${flour.id}:weight`}, false, null),
          (${u.id}, ${thisWeek}, 'raw:for the sauce:', true, null)`;
        await sql.unsafe(BACKFILL);
        rows = await sql<{ unit_key: string; quantity: number }[]>`
          select unit_key, quantity::float as quantity from inventory where user_id = ${u.id} order by unit_key`;
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
    expect(rows.map((r) => ({ ...r }))).toEqual([{ unit_key: "volume", quantity: 150 }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int`
Expected: FAIL. The `inventory` table doesn't exist, and the migration file can't be read.

- [ ] **Step 3: Add the table to `db/schema.ts`**

```ts
export const inventory = pgTable(
  "inventory",
  {
    userId: uuid("user_id").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    /** Same unit key as grocery lines (D17): volume, weight or count:<unit|each>. */
    unitKey: text("unit_key").notNull(),
    /** In base units: ml, g or a count. Rows reaching 0 are deleted. */
    quantity: numeric("quantity", { mode: "number" }).notNull(),
    /** "us" | "metric" | null: how to display the amount. */
    system: text("system"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId, t.unitKey] }), check("inventory_quantity_nonnegative", sql`${t.quantity} >= 0`)],
);
```

- [ ] **Step 4: Generate migrations and write the RLS and backfill migration**

Run: `pnpm db:generate --name=inventory`, then `pnpm exec drizzle-kit generate --custom --name=inventory_rls_and_backfill`. Replace the contents of `db/migrations/0008_inventory_rls_and_backfill.sql` with:

```sql
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON "inventory" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory" TO authenticated;
--> statement-breakpoint
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Rows are the owner's, and may only point at the owner's own items.
CREATE POLICY "inventory_owner" ON "inventory" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid()))
  WITH CHECK (
    "user_id" = (select auth.uid())
    AND EXISTS (SELECT 1 FROM "items" i WHERE i."id" = "item_id" AND i."user_id" = (select auth.uid()))
  );
--> statement-breakpoint
-- Backfill (D27): until phase 4 a checked amount meant "bought this week" (D18). Carry checked item lines
-- of the current and future weeks into inventory; older weeks are treated as used up. Keys look like
-- item:<36-char uuid>:<unitKey>, so the unit key starts at character 43.
INSERT INTO "inventory" ("user_id", "item_id", "unit_key", "quantity")
SELECT m."user_id", i."id", substring(m."key" from 43), sum(m."checked_qty")
FROM "grocery_marks" m
JOIN "items" i ON i."user_id" = m."user_id" AND i."id"::text = substring(m."key" from 6 for 36)
WHERE m."checked" AND m."checked_qty" IS NOT NULL AND m."key" LIKE 'item:%'
  AND m."week_start" >= date_trunc('week', now())::date
GROUP BY m."user_id", i."id", substring(m."key" from 43)
ON CONFLICT ("user_id", "item_id", "unit_key") DO UPDATE SET "quantity" = "inventory"."quantity" + excluded."quantity";
```

Run: `pnpm db:migrate`
Expected: both migrations apply. This also backfills your local checked marks.

- [ ] **Step 5: ★ The re-parse script keeps items still in use**

In `db/queries/maintenance.ts`:
- Add `inventory` and `planEntries` to the schema import.
- Add two conditions to the `and(...)` of the delete:
  ```ts
        notExists(db.select({ one: sql`1` }).from(inventory).where(eq(inventory.itemId, items.id))),
        // Cooked meals record what they took (`<item_id>|<unitKey>` keys) so un-cooking can put it back.
        notExists(
          db
            .select({ one: sql`1` })
            .from(planEntries)
            .where(sql`${planEntries.deducted} is not null and exists (select 1 from jsonb_object_keys(${planEntries.deducted}) k where split_part(k, '|', 1) = ${items.id}::text)`),
        ),
  ```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:int && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add db tests/integration
git commit -m "Add inventory table with RLS, backfill checked marks, keep in-use items on re-parse" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Inventory queries, and the list's effect on inventory

**Files:**
- Create: `db/queries/inventory.ts`, `tests/integration/inventory.test.ts`
- Modify: `db/queries/grocery.ts`

**Interfaces:**
- Consumes:
  - Task 1's `InventoryEntry`, `amountForKey` and `stockKey`
  - Task 2's `parseLineKey`, and the `buildGroceryList` inventory option
  - Task 3's table
  - `resolveItems` and `parseIngredient` (phase 1); `toBase` and `formatAmount`
- Produces (in `@/db/queries/inventory`):
  - `type StockRow = InventoryEntry & { name: string; section: string }`
  - `listInventory(userId): Promise<StockRow[]>`, ordered by section and then name
  - `getStock(tx: DbOrTx, userId): Promise<InventoryEntry[]>`
  - `adjustInventory(tx, userId, itemId, unitKey, delta, system): Promise<void>`
  - `addStockFromText(userId, text): Promise<"ok" | "unreadable">`
  - `setStockAmount(userId, itemId, unitKey, text): Promise<"ok" | "unreadable" | "missing">`
  - `removeStock(userId, itemId, unitKey): Promise<boolean>`
- Changes (in `@/db/queries/grocery`):
  - `getGroceryList` passes inventory to the builder;
  - `checkGroceryLine`, `uncheckGroceryLine` and `setGroceryExtraChecked` update inventory in the same transaction;
  - new `setBoughtAmount(userId, weekStart, key, text): Promise<"ok" | "unreadable" | "missing">`

- [ ] **Step 1: Write the failing tests**

`tests/integration/inventory.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import {
  addGroceryExtra,
  checkGroceryLine,
  getGroceryList,
  removeGroceryExtra,
  setBoughtAmount,
  setGroceryExtraChecked,
  uncheckGroceryLine,
} from "@/db/queries/grocery";
import { addStockFromText, listInventory, removeStock, setStockAmount } from "@/db/queries/inventory";
import { addPlanEntry, setPlanEntryCooked } from "@/db/queries/plan";
import { createRecipe } from "@/db/queries/recipes";
import { formatAmount } from "@/lib/units";
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

const shelf = async (userId: string) =>
  (await listInventory(userId)).map((r) => `${formatAmount(r.unitKey, r.quantity, r.system)} ${r.name}`);
const firstLine = async (userId: string) => (await getGroceryList(userId, WEEK)).sections[0].lines[0];

async function planned(userId: string, lines: string[], servings = 4) {
  const r = await createRecipe(userId, recipe("Bake", lines, servings));
  const entry = await addPlanEntry(userId, { recipeId: r, date: "2026-09-29", servings: null, label: null });
  return entry!;
}

describe("inventory", () => {
  it("adds, edits and removes stock by text", async () => {
    const u = await newUser();
    expect(await addStockFromText(u.id, "2 cups flour")).toBe("ok");
    expect(await addStockFromText(u.id, "1 cup flour")).toBe("ok");
    expect(await addStockFromText(u.id, "flour")).toBe("unreadable");
    expect(await shelf(u.id)).toEqual(["3 cups flour"]);
    const [row] = await listInventory(u.id);
    expect(await setStockAmount(u.id, row.itemId, row.unitKey, "500 g")).toBe("unreadable");
    expect(await setStockAmount(u.id, row.itemId, row.unitKey, "1 ½ cups")).toBe("ok");
    expect(await shelf(u.id)).toEqual(["1 ½ cups flour"]);
    expect(await removeStock(u.id, row.itemId, row.unitKey)).toBe(true);
    expect(await shelf(u.id)).toEqual([]);
  });

  it("subtracts stock from the list", async () => {
    const u = await newUser();
    await planned(u.id, ["3 cups flour"]);
    await addStockFromText(u.id, "1 cup flour");
    expect((await firstLine(u.id)).label).toBe("2 cups flour");
  });

  it("checking adds the shortfall to inventory; unchecking takes it back", async () => {
    const u = await newUser();
    await planned(u.id, ["3 cups flour"]);
    await addStockFromText(u.id, "1 cup flour");
    const line = await firstLine(u.id);
    expect(await checkGroceryLine(u.id, WEEK, line.key)).toBe(true);
    expect(await shelf(u.id)).toEqual(["3 cups flour"]);
    await uncheckGroceryLine(u.id, WEEK, line.key);
    expect(await shelf(u.id)).toEqual(["1 cup flour"]);
  });

  it("checking and unchecking twice changes inventory once", async () => {
    const u = await newUser();
    await planned(u.id, ["2 cups flour"]);
    const line = await firstLine(u.id);
    await checkGroceryLine(u.id, WEEK, line.key);
    expect(await checkGroceryLine(u.id, WEEK, line.key)).toBe(false);
    expect(await shelf(u.id)).toEqual(["2 cups flour"]);
    await uncheckGroceryLine(u.id, WEEK, line.key);
    await uncheckGroceryLine(u.id, WEEK, line.key);
    expect(await shelf(u.id)).toEqual([]);
  });

  it("changes a bought amount and moves inventory by the difference", async () => {
    const u = await newUser();
    await planned(u.id, ["2 cups flour"]);
    const line = await firstLine(u.id);
    await checkGroceryLine(u.id, WEEK, line.key);
    expect(await setBoughtAmount(u.id, WEEK, line.key, "500 g")).toBe("unreadable");
    expect(await setBoughtAmount(u.id, WEEK, line.key, "3 cups")).toBe("ok");
    expect(await shelf(u.id)).toEqual(["3 cups flour"]);
    expect((await firstLine(u.id)).label).toBe("3 cups flour");
    expect(await setBoughtAmount(u.id, WEEK, "raw:nothing", "1 cup")).toBe("missing");
  });

  it("checked extras with an amount add to inventory once, and stay when removed", async () => {
    const u = await newUser();
    const apples = (await addGroceryExtra(u.id, WEEK, "2 lb apples"))!;
    const towels = (await addGroceryExtra(u.id, WEEK, "paper towels"))!;
    await setGroceryExtraChecked(u.id, apples, true);
    await setGroceryExtraChecked(u.id, apples, true);
    await setGroceryExtraChecked(u.id, towels, true);
    expect(await shelf(u.id)).toEqual(["2 lb apples"]);
    await removeGroceryExtra(u.id, apples);
    expect(await shelf(u.id)).toEqual(["2 lb apples"]);
    const pears = (await addGroceryExtra(u.id, WEEK, "3 pears"))!;
    await setGroceryExtraChecked(u.id, pears, true);
    await setGroceryExtraChecked(u.id, pears, false);
    expect(await shelf(u.id)).toEqual(["2 lb apples"]);
  });

  it("the buy → cook → uncook → uncheck round trip is exact", async () => {
    const u = await newUser();
    await addStockFromText(u.id, "1 cup flour");
    const before = await listInventory(u.id);
    const entry = await planned(u.id, ["3 cups flour", "2 eggs"]);
    const line = (await getGroceryList(u.id, WEEK)).sections.flatMap((s) => s.lines).find((l) => l.name === "flour")!;
    await checkGroceryLine(u.id, WEEK, line.key);
    await setPlanEntryCooked(u.id, entry, true);
    expect(await shelf(u.id)).toEqual([]);
    await setPlanEntryCooked(u.id, entry, false);
    expect(await shelf(u.id)).toEqual(["3 cups flour"]);
    await uncheckGroceryLine(u.id, WEEK, line.key);
    expect(await listInventory(u.id)).toEqual(before);
  });

  it("never touches another user's inventory", async () => {
    const [owner, other] = await Promise.all([newUser(), newUser()]);
    await addStockFromText(owner.id, "2 cups flour");
    const [row] = await listInventory(owner.id);
    expect(await setStockAmount(other.id, row.itemId, row.unitKey, "9 cups")).toBe("missing");
    expect(await removeStock(other.id, row.itemId, row.unitKey)).toBe(false);
    expect(await listInventory(other.id)).toEqual([]);
    expect(await shelf(owner.id)).toEqual(["2 cups flour"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int tests/integration/inventory.test.ts`
Expected: FAIL, "Cannot find package '@/db/queries/inventory'".

- [ ] **Step 3: Implement `db/queries/inventory.ts`**

```ts
import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { inventory, items } from "@/db/schema";
import { normalizeItemName, parseIngredient } from "@/lib/ingredients";
import { amountForKey, type InventoryEntry } from "@/lib/inventory";
import { toBase, type UnitSystem } from "@/lib/units";
import { resolveItems } from "./items";

export type StockRow = InventoryEntry & { name: string; section: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIT_KEY = /^(volume|weight|count:[a-z ]+)$/;
const owned = (userId: string, itemId: string, unitKey: string) =>
  and(eq(inventory.userId, userId), eq(inventory.itemId, itemId), eq(inventory.unitKey, unitKey));
const asSystem = (s: string | null): UnitSystem | null => (s === "us" || s === "metric" ? s : null);

export async function listInventory(userId: string): Promise<StockRow[]> {
  const rows = await db
    .select({ itemId: inventory.itemId, unitKey: inventory.unitKey, quantity: inventory.quantity, system: inventory.system, name: items.name, section: items.section })
    .from(inventory)
    .innerJoin(items, and(eq(items.id, inventory.itemId), eq(items.userId, userId)))
    .where(eq(inventory.userId, userId))
    .orderBy(asc(items.section), asc(items.name), asc(inventory.unitKey));
  return rows.map((r) => ({ ...r, system: asSystem(r.system) }));
}

export async function getStock(tx: DbOrTx, userId: string): Promise<InventoryEntry[]> {
  const rows = await tx
    .select({ itemId: inventory.itemId, unitKey: inventory.unitKey, quantity: inventory.quantity, system: inventory.system })
    .from(inventory)
    .where(eq(inventory.userId, userId));
  return rows.map((r) => ({ ...r, system: asSystem(r.system) }));
}

/** Adds `delta` (may be negative) in base units, never below 0; a row reaching 0 is deleted. */
export async function adjustInventory(tx: DbOrTx, userId: string, itemId: string, unitKey: string, delta: number, system: UnitSystem | null): Promise<void> {
  if (delta === 0) return;
  await tx
    .insert(inventory)
    .values({ userId, itemId, unitKey, quantity: Math.max(0, delta), system })
    .onConflictDoUpdate({
      target: [inventory.userId, inventory.itemId, inventory.unitKey],
      set: {
        quantity: sql`greatest(0, ${inventory.quantity} + ${delta}::numeric)`,
        system: sql`coalesce(excluded.system, ${inventory.system})`,
        updatedAt: new Date(),
      },
    });
  await tx.delete(inventory).where(and(owned(userId, itemId, unitKey), lte(inventory.quantity, 0)));
}

/** "2 lb flour" → adds to that item's stock. Needs an amount and an item. */
export async function addStockFromText(userId: string, text: string): Promise<"ok" | "unreadable"> {
  const parsed = parseIngredient(text);
  if (parsed.quantity === null || parsed.quantity <= 0 || parsed.name === null) return "unreadable";
  const base = toBase(parsed.quantity, parsed.unit);
  await db.transaction(async (tx) => {
    const ids = await resolveItems(tx, userId, [{ name: parsed.name!, unit: parsed.unit }]);
    const itemId = ids.get(normalizeItemName(parsed.name!))!;
    await adjustInventory(tx, userId, itemId, base.unitKey, base.amount, base.system);
  });
  return "ok";
}

export async function setStockAmount(userId: string, itemId: string, unitKey: string, text: string): Promise<"ok" | "unreadable" | "missing"> {
  if (!UUID.test(itemId) || !UNIT_KEY.test(unitKey)) return "missing";
  const amount = amountForKey(text, unitKey);
  if (!amount) return "unreadable";
  const rows = await db
    .update(inventory)
    .set({ quantity: amount.amount, system: amount.system ?? sql`${inventory.system}`, updatedAt: new Date() })
    .where(owned(userId, itemId, unitKey))
    .returning({ itemId: inventory.itemId });
  return rows.length > 0 ? "ok" : "missing";
}

export async function removeStock(userId: string, itemId: string, unitKey: string): Promise<boolean> {
  if (!UUID.test(itemId) || !UNIT_KEY.test(unitKey)) return false;
  const rows = await db.delete(inventory).where(owned(userId, itemId, unitKey)).returning({ itemId: inventory.itemId });
  return rows.length > 0;
}
```

- [ ] **Step 4: Make the grocery queries inventory-aware in `db/queries/grocery.ts`**

1. Imports:
   - add `type DbOrTx` to the `@/db` import;
   - add `parseLineKey` to the `@/lib/grocery` import;
   - add `amountForKey` from `@/lib/inventory`, and `toBase` from `@/lib/units`;
   - add `adjustInventory` and `getStock` from `./inventory`.
2. `getGroceryList`: also load `getStock(db, userId)` in its `Promise.all`, and pass `{ ...opts, inventory: stock }` to `buildGroceryList`.
3. `upsertMark`: take `tx: DbOrTx` as its first parameter and use it instead of `db`. Update every caller.
4. Replace `checkGroceryLine`, `uncheckGroceryLine` and `setGroceryExtraChecked`, and add `setBoughtAmount`:

```ts
/** Marks the line's current shortfall as bought and adds it to inventory, in one transaction. Amounts never come from the client. */
export async function checkGroceryLine(userId: string, weekStart: string, key: string, at: Date = new Date()): Promise<boolean> {
  const list = await getGroceryList(userId, weekStart, { showHidden: true });
  const need = list.sections.flatMap((s) => s.lines).find((l) => l.kind === "need" && l.key === key);
  if (!need) return false;
  await db.transaction(async (tx) => {
    const [mark] = await tx
      .select({ checked: groceryMarks.checked, checkedQty: groceryMarks.checkedQty })
      .from(groceryMarks)
      .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, weekStart), eq(groceryMarks.key, key)))
      .for("update");
    const already = mark?.checked ? (mark.checkedQty ?? 0) : 0;
    await upsertMark(tx, userId, weekStart, key, { checked: true, checkedQty: need.shortfallBase === null ? null : already + need.shortfallBase }, at);
    const parts = parseLineKey(key);
    if (parts && need.shortfallBase !== null) await adjustInventory(tx, userId, parts.itemId, parts.unitKey, need.shortfallBase, need.system);
  });
  return true;
}

/** Takes the bought amount back out of inventory and clears the mark. Does nothing to inventory if it wasn't checked. */
export async function uncheckGroceryLine(userId: string, weekStart: string, key: string, at: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const [mark] = await tx
      .select({ checked: groceryMarks.checked, checkedQty: groceryMarks.checkedQty })
      .from(groceryMarks)
      .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, weekStart), eq(groceryMarks.key, key)))
      .for("update");
    const parts = parseLineKey(key);
    if (mark?.checked && mark.checkedQty !== null && parts) await adjustInventory(tx, userId, parts.itemId, parts.unitKey, -mark.checkedQty, null);
    await upsertMark(tx, userId, weekStart, key, { checked: false, checkedQty: null }, at);
  });
}

/** Changes how much of a checked line was bought; inventory moves by the difference. */
export async function setBoughtAmount(userId: string, weekStart: string, key: string, text: string): Promise<"ok" | "unreadable" | "missing"> {
  const parts = parseLineKey(key);
  if (!parts) return "missing";
  const amount = amountForKey(text, parts.unitKey);
  if (!amount) return "unreadable";
  return db.transaction(async (tx) => {
    const [mark] = await tx
      .select({ checked: groceryMarks.checked, checkedQty: groceryMarks.checkedQty })
      .from(groceryMarks)
      .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, weekStart), eq(groceryMarks.key, key)))
      .for("update");
    if (!mark?.checked || mark.checkedQty === null) return "missing";
    await upsertMark(tx, userId, weekStart, key, { checkedQty: amount.amount });
    await adjustInventory(tx, userId, parts.itemId, parts.unitKey, amount.amount - mark.checkedQty, amount.system);
    return "ok";
  });
}

export async function setGroceryExtraChecked(userId: string, id: string, checked: boolean, at: Date = new Date()): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const [extra] = await tx
      .select({ checked: groceryExtras.checked, itemId: groceryExtras.itemId, quantity: groceryExtras.quantity, unit: groceryExtras.unit })
      .from(groceryExtras)
      .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
      .for("update");
    if (!extra) return false;
    // Inventory follows real changes only, so a repeated check (e.g. re-sent offline) adds nothing.
    if (extra.checked !== checked && extra.itemId !== null && extra.quantity !== null) {
      const base = toBase(extra.quantity, extra.unit);
      await adjustInventory(tx, userId, extra.itemId, base.unitKey, checked ? base.amount : -base.amount, base.system);
    }
    await tx.update(groceryExtras).set({ checked, updatedAt: at }).where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)));
    return true;
  });
}
```

Notes:
- `upsertMark` with no `at` argument: in `setBoughtAmount`, the update leaves `updated_at` alone, because only check-offs carry device times (D23).
- `applyGroceryChanges` needs no change: it calls these functions.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:int && pnpm exec tsc --noEmit`
Expected: PASS, including the phase 3 grocery tests (checking still shows only the additional amount when the plan grows, now through inventory). The one exception is `the buy → cook → uncook → uncheck round trip is exact`, which needs Task 5's cooking change; it is expected to fail until Task 5, and passes there.

- [ ] **Step 6: Commit**

```bash
git add db/queries tests/integration/inventory.test.ts
git commit -m "Inventory queries; checking off adds to inventory, unchecking takes it back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cooking deducts from inventory

**Files:**
- Modify: `db/queries/plan.ts`, `tests/integration/plan.test.ts`

**Interfaces:**
- Consumes: `planDeductions`, `stockMap` and `splitStockKey` (Task 1); `getStock` and `adjustInventory` (Task 4)
- Changes: `setPlanEntryCooked(userId, id, cooked)` keeps the same signature, and now deducts and restores

- [ ] **Step 1: Write the failing tests**

Append to `describe("plan queries", …)` in `tests/integration/plan.test.ts` (add the imports `addStockFromText` and `listInventory` from `@/db/queries/inventory`, and `formatAmount` from `@/lib/units`):

```ts
  it("takes only what's on hand and restores exactly that", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, { ...soup, ingredients: ["3 cups flour", "2 eggs", "Salt to taste"] });
    const a = await add(u.id, r);
    await addStockFromText(u.id, "1 cup flour");
    await addStockFromText(u.id, "6 eggs");
    expect(await setPlanEntryCooked(u.id, a, true)).toBe(true);
    const shelf = async () => (await listInventory(u.id)).map((s) => `${formatAmount(s.unitKey, s.quantity, s.system)} ${s.name}`);
    expect(await shelf()).toEqual(["4 eggs"]);
    expect(await setPlanEntryCooked(u.id, a, false)).toBe(true);
    expect(await shelf()).toEqual(["6 eggs", "1 cup flour"]);
  });

  it("cooking or un-cooking twice does nothing the second time", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, { ...soup, ingredients: ["2 eggs"] });
    const a = await add(u.id, r);
    await addStockFromText(u.id, "6 eggs");
    await setPlanEntryCooked(u.id, a, true);
    await setPlanEntryCooked(u.id, a, true);
    expect((await listInventory(u.id))[0].quantity).toBe(4);
    await setPlanEntryCooked(u.id, a, false);
    await setPlanEntryCooked(u.id, a, false);
    expect((await listInventory(u.id))[0].quantity).toBe(6);
  });
```

(`soup` has 4 servings, and `add` plans it at the recipe's servings, so the factor is 1. The sort order is section, then name: "dairy & eggs" comes before "pantry".)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int tests/integration/plan.test.ts`
Expected: FAIL. Inventory is unchanged after cooking.

- [ ] **Step 3: Implement in `db/queries/plan.ts`**

Imports: add `recipeIngredients` to the schema import; add `planDeductions`, `splitStockKey` and `stockMap` from `@/lib/inventory`; add `adjustInventory` and `getStock` from `./inventory`. Replace `setPlanEntryCooked`:

```ts
/**
 * Cooking takes the meal's scaled ingredients out of inventory (never more than is on hand) and records what it
 * took; un-cooking puts exactly that back. Repeating either does nothing.
 */
export async function setPlanEntryCooked(userId: string, id: string, cooked: boolean): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ cookedAt: planEntries.cookedAt, deducted: planEntries.deducted, recipeId: planEntries.recipeId, servings: planEntries.servings })
      .from(planEntries)
      .where(owned(userId, id))
      .for("update");
    if (!entry) return false;
    if (cooked === (entry.cookedAt !== null)) return true;

    if (cooked) {
      const [recipe] = await tx
        .select({ servings: recipes.servings })
        .from(recipes)
        .where(and(eq(recipes.id, entry.recipeId), eq(recipes.userId, userId)));
      const ingredients = await tx
        .select({ itemId: recipeIngredients.itemId, quantity: recipeIngredients.quantity, unit: recipeIngredients.unit })
        .from(recipeIngredients)
        .where(and(eq(recipeIngredients.recipeId, entry.recipeId), eq(recipeIngredients.userId, userId)));
      const factor = recipe && recipe.servings > 0 ? entry.servings / recipe.servings : 1;
      const deducted = planDeductions(ingredients, factor, stockMap(await getStock(tx, userId)));
      for (const [key, take] of Object.entries(deducted)) {
        const parts = splitStockKey(key);
        if (parts) await adjustInventory(tx, userId, parts.itemId, parts.unitKey, -take, null);
      }
      await tx.update(planEntries).set({ cookedAt: new Date(), deducted }).where(owned(userId, id));
    } else {
      for (const [key, take] of Object.entries(entry.deducted ?? {})) {
        const parts = splitStockKey(key);
        if (parts) await adjustInventory(tx, userId, parts.itemId, parts.unitKey, take, null);
      }
      await tx.update(planEntries).set({ cookedAt: null, deducted: null }).where(owned(userId, id));
    }
    return true;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:int && pnpm exec tsc --noEmit`
Expected: PASS: plan tests, phase 2's cooked tests and Task 4's round trip.

- [ ] **Step 5: Commit**

```bash
git add db/queries/plan.ts tests/integration/plan.test.ts
git commit -m "Cooking deducts from inventory; un-cooking restores exactly" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The `/inventory` page

**Files:**
- Create: `page.tsx`, `actions.ts`, `stock-forms.tsx` and `error.tsx`, all in `app/(app)/inventory/`
- Modify: `components/app-nav.tsx`

**Interfaces:**
- Consumes: Task 4's inventory queries; `formatAmount`; `SECTIONS`; `ConfirmForm`, `ui` and `requireUser`
- Produces:
  - `type StockFormState = { error?: string; text?: string } | null`
  - `addStockAction(prev, fd)`, `setStockAction(itemId, unitKey, prev, fd)` and `removeStockAction(itemId, unitKey)`

- [ ] **Step 1: The Inventory tab, and the actions**

In `components/app-nav.tsx`, add `{ href: "/inventory", label: "Inventory" },` as the last entry in `TABS`, and change the comment above it to `// Phase 5 adds Stores here.`.

`app/(app)/inventory/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { addStockFromText, removeStock, setStockAmount } from "@/db/queries/inventory";
import { requireUser } from "@/server/auth";

export type StockFormState = { error?: string; text?: string } | null;

const refresh = () => {
  revalidatePath("/inventory");
  revalidatePath("/list");
};

export async function addStockAction(_prev: StockFormState, formData: FormData): Promise<StockFormState> {
  const user = await requireUser("/inventory");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Type an amount and an item, e.g. 2 lb flour.", text };
  if (text.length > 200) return { error: "Keep it under 200 characters.", text };
  if ((await addStockFromText(user.id, text)) === "unreadable") return { error: "Include an amount and an item, e.g. 2 lb flour.", text };
  refresh();
  return null;
}

export async function setStockAction(itemId: string, unitKey: string, _prev: StockFormState, formData: FormData): Promise<StockFormState> {
  const user = await requireUser("/inventory");
  const text = String(formData.get("amount") ?? "").trim();
  const result = await setStockAmount(user.id, itemId, unitKey, text);
  if (result === "unreadable") return { error: unitKey.startsWith("count:") ? "Enter a number, e.g. 3." : `Enter a ${unitKey} amount, e.g. ${unitKey === "volume" ? "2 cups" : "500 g"}.`, text };
  if (result === "missing") return { error: "That item isn't in your inventory any more.", text };
  refresh();
  return null;
}

export async function removeStockAction(itemId: string, unitKey: string): Promise<void> {
  const user = await requireUser("/inventory");
  await removeStock(user.id, itemId, unitKey);
  refresh();
}
```

- [ ] **Step 2: Forms (client) and the page**

`app/(app)/inventory/stock-forms.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { StockFormState } from "./actions";

type Action = (prev: StockFormState, formData: FormData) => Promise<StockFormState>;

export function AddStockForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mb-6 flex flex-wrap gap-2" noValidate>
      <label htmlFor="stock-text" className="sr-only">
        Add to inventory
      </label>
      <input
        id="stock-text"
        name="text"
        placeholder="Add to inventory, e.g. 2 lb flour"
        defaultValue={state?.text ?? ""}
        aria-invalid={!!state?.error}
        aria-describedby={state?.error ? "stock-error" : undefined}
        className={`${ui.input} mt-0 min-w-0 flex-1`}
      />
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state?.error && (
        <p id="stock-error" role="alert" className={`${ui.error} w-full`}>
          {state.error}
        </p>
      )}
    </form>
  );
}

export function EditStockForm({ id, name, current, action }: { id: string; name: string; current: string; action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
      <div className="min-w-32 flex-1">
        <label htmlFor={`amount-${id}`} className={ui.label}>
          Amount of {name}
        </label>
        <input
          id={`amount-${id}`}
          name="amount"
          defaultValue={state?.text ?? current}
          aria-invalid={!!state?.error}
          aria-describedby={state?.error ? `amount-${id}-error` : undefined}
          className={ui.input}
        />
      </div>
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && (
        <p id={`amount-${id}-error`} role="alert" className={`${ui.error} w-full`}>
          {state.error}
        </p>
      )}
    </form>
  );
}
```

`app/(app)/inventory/page.tsx`:

```tsx
import { ConfirmForm } from "@/components/confirm-form";
import { ui } from "@/components/ui";
import { listInventory } from "@/db/queries/inventory";
import { SECTIONS } from "@/lib/sections";
import { formatAmount } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { addStockAction, removeStockAction, setStockAction } from "./actions";
import { AddStockForm, EditStockForm } from "./stock-forms";

export default async function InventoryPage() {
  const user = await requireUser("/inventory");
  const rows = await listInventory(user.id);
  const sections = SECTIONS.map((section) => ({ section, rows: rows.filter((r) => r.section === section) })).filter((s) => s.rows.length > 0);
  const others = rows.filter((r) => !(SECTIONS as readonly string[]).includes(r.section));
  if (others.length > 0) sections.push({ section: "other", rows: others });

  return (
    <main className={ui.page}>
      <h1 className={`${ui.h1} mb-2`}>Inventory</h1>
      <p className="mb-4 text-neutral-600 dark:text-neutral-400">What’s on hand. The grocery list buys only what this doesn’t cover.</p>
      <AddStockForm action={addStockAction} />

      {sections.length === 0 ? (
        <div className={`${ui.card} text-center`}>
          <p>Nothing on hand yet. Add items above, or check items off your grocery list.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(({ section, rows: sectionRows }) => (
            <section key={section} aria-labelledby={`inv-${section}`}>
              <h2 id={`inv-${section}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {section}
              </h2>
              <ul className={`${ui.card} divide-y divide-neutral-100 p-0 dark:divide-neutral-800`}>
                {sectionRows.map((row) => {
                  const amount = formatAmount(row.unitKey, row.quantity, row.system);
                  const id = `${row.itemId}-${row.unitKey.replace(/[^a-z0-9]/gi, "-")}`;
                  return (
                    <li key={id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {amount} {row.name}
                        </span>
                        <ConfirmForm action={removeStockAction.bind(null, row.itemId, row.unitKey)} message={`Remove ${row.name} from your inventory?`}>
                          <button type="submit" aria-label={`Remove ${row.name}`} className="text-sm text-neutral-500 hover:underline">
                            Remove
                          </button>
                        </ConfirmForm>
                      </div>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">Edit amount</summary>
                        <EditStockForm id={id} name={row.name} current={amount} action={setStockAction.bind(null, row.itemId, row.unitKey)} />
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
```

`app/(app)/inventory/error.tsx`: the same as `app/(app)/list/error.tsx`, with the component named `InventoryError` and the message "We couldn’t load your inventory.".

- [ ] **Step 3: Type-check, lint, tests**

Run: `pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add components/app-nav.tsx "app/(app)/inventory"
git commit -m "Add the inventory page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The list shows hints and lets you change a bought amount

**Files:**
- Create: `app/(app)/list/bought-amount-form.tsx`
- Modify: `app/(app)/list/grocery-lines.tsx`, `app/(app)/list/actions.ts`

**Interfaces:**
- Consumes: `setBoughtAmount` (Task 4); `GroceryLine.hint`, `.dimmed` (Task 2); `useOnline`
- Produces:
  - `setBoughtAmountAction(week, key, prev, fd): Promise<BoughtAmountState>`
  - `type BoughtAmountState = { error?: string; text?: string; saved?: boolean } | null`

- [ ] **Step 1: The action**

Append to `app/(app)/list/actions.ts` (and add `setBoughtAmount` to its `@/db/queries/grocery` import):

```ts
export type BoughtAmountState = { error?: string; text?: string; saved?: boolean } | null;

export async function setBoughtAmountAction(week: string, key: string, _prev: BoughtAmountState, formData: FormData): Promise<BoughtAmountState> {
  const user = await requireUser("/list");
  const text = String(formData.get("amount") ?? "").trim();
  if (!isListWeek(week) || !isLineKey(key)) return { error: "That line isn't on this list.", text };
  const result = await setBoughtAmount(user.id, week, key, text);
  if (result === "unreadable") return { error: "Enter an amount of the same kind, e.g. 3 cups, 500 g or 2.", text };
  if (result === "missing") return { error: "Check the item off first.", text };
  revalidatePath("/list");
  revalidatePath("/inventory");
  return { saved: true };
}
```

- [ ] **Step 2: The form (client)**

`app/(app)/list/bought-amount-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { BoughtAmountState } from "./actions";

export function BoughtAmountForm({
  id,
  name,
  current,
  disabled,
  action,
}: {
  id: string;
  name: string;
  current: string;
  disabled: boolean;
  action: (prev: BoughtAmountState, formData: FormData) => Promise<BoughtAmountState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-neutral-500">Change amount</summary>
      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
        <div className="min-w-28 flex-1">
          <label htmlFor={`bought-${id}`} className={ui.label}>
            Bought of {name}
          </label>
          <input
            id={`bought-${id}`}
            name="amount"
            defaultValue={state?.text ?? current}
            aria-invalid={!!state?.error}
            aria-describedby={state?.error ? `bought-${id}-error` : undefined}
            className={ui.input}
          />
        </div>
        <button type="submit" disabled={pending || disabled} className={ui.buttonSecondary}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.error && (
          <p id={`bought-${id}-error`} role="alert" className={`${ui.error} w-full`}>
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
```

- [ ] **Step 3: Hints, dimming and the form on the line**

In `app/(app)/list/grocery-lines.tsx`:
- Import `BoughtAmountForm` from `./bought-amount-form`, and add `setBoughtAmountAction` to the `./actions` import.
- Change the `<li>`'s class from `${line.hidden ? "opacity-50" : ""}` to `${line.hidden || line.dimmed ? "opacity-50" : ""}`.
- Inside the `<label>`, after the recipes `<span>`, add:
  ```tsx
  {line.hint && <span className="block text-xs text-emerald-700 dark:text-emerald-400">{line.hint}</span>}
  ```
- After the `</label>`, before the Hide/Remove forms, add the amount editor for bought item lines. It has to sit outside the label so the checkbox isn't toggled:
  ```tsx
  {line.kind === "bought" && line.key.startsWith("item:") && line.label !== line.name && (
    <div className="w-full basis-full pl-8">
      <BoughtAmountForm
        id={line.id.replace(/[^a-z0-9]/gi, "-")}
        name={line.name}
        current={line.label.slice(0, line.label.length - line.name.length).trim()}
        disabled={!online}
        action={setBoughtAmountAction.bind(null, week, line.key)}
      />
    </div>
  )}
  ```
- Add `flex-wrap` to the `<li>` class list, so the editor wraps onto its own row.

- [ ] **Step 4: Type-check, lint, unit tests, and the list e2e**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm exec playwright test tests/e2e/list.spec.ts tests/e2e/offline.spec.ts`
Expected: all green. That includes the phase 3 list and offline tests: checking off still shows "· 1 checked", and the keyboard focus test still passes.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/list"
git commit -m "Grocery list: stock hints and changing a bought amount" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end tests

**Files:**
- Create: `tests/e2e/inventory.spec.ts`

- [ ] **Step 1: Write the tests**

`tests/e2e/inventory.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "./helpers";

test.use({ timezoneId: "America/Los_Angeles" });

const item = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });

async function planToday(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
}

async function addStock(page: Page, text: string) {
  await page.goto("/inventory");
  await page.getByLabel("Add to inventory").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Add to inventory")).toHaveValue("");
}

test.describe("inventory", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("stock reduces the list, and buying adds to stock", async ({ page }) => {
    const bread = await createRecipeViaUi(page, "Bread", 4, "3 cups flour");
    await planToday(page, bread);
    await addStock(page, "1 cup flour");
    await expect(item(page, "1 cup flour")).toBeVisible();

    await page.getByRole("link", { name: "List", exact: true }).click();
    await item(page, "2 cups flour").getByRole("checkbox").check();
    await expect(page.getByText(/· 1 checked/)).toBeVisible();

    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(item(page, "3 cups flour")).toBeVisible();
  });

  test("cooking takes from stock and un-cooking puts it back", async ({ page }) => {
    const bread = await createRecipeViaUi(page, "Bread", 4, "2 cups flour");
    await addStock(page, "3 cups flour");
    await planToday(page, bread);
    await page.getByRole("article", { name: "Bread" }).getByRole("button", { name: "Mark cooked" }).click();
    await expect(page.getByRole("article", { name: "Bread" })).toContainText("✓ Cooked");
    await page.goto("/inventory");
    await expect(item(page, "1 cup flour")).toBeVisible();

    await page.goto("/plan");
    await page.getByRole("article", { name: "Bread" }).getByRole("button", { name: "Mark not cooked" }).click();
    await expect(page.getByRole("article", { name: "Bread" })).not.toContainText("✓ Cooked");
    await page.goto("/inventory");
    await expect(item(page, "3 cups flour")).toBeVisible();
  });

  test("edit and remove stock; amounts must match the item's kind", async ({ page }) => {
    await addStock(page, "2 cups flour");
    const row = item(page, "2 cups flour");
    await row.getByText("Edit amount").click();
    await row.getByLabel("Amount of flour").fill("500 g");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("alert")).toContainText("Enter a volume amount");

    await row.getByLabel("Amount of flour").fill("1 ½ cups");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(item(page, "1 ½ cups flour")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove flour" }).click();
    await expect(page.getByText("Nothing on hand yet.")).toBeVisible();
  });

  test("a bought amount can be changed", async ({ page }) => {
    const bread = await createRecipeViaUi(page, "Bread", 4, "2 cups flour");
    await planToday(page, bread);
    await page.goto("/list");
    await item(page, "2 cups flour").getByRole("checkbox").check();
    await expect(page.getByText(/· 1 checked/)).toBeVisible();
    const row = item(page, "2 cups flour");
    await row.getByText("Change amount").click();
    await row.getByLabel("Bought of flour").fill("3 cups");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(item(page, "3 cups flour")).toBeVisible();
    await page.goto("/inventory");
    await expect(item(page, "3 cups flour")).toBeVisible();
  });

  test("stock in another unit kind is a hint, not a subtraction", async ({ page }) => {
    const cake = await createRecipeViaUi(page, "Cake", 4, "200 g flour\nSalt to taste");
    await addStock(page, "2 cups flour");
    await addStock(page, "1 tsp salt");
    await planToday(page, cake);
    await page.goto("/list");
    await expect(item(page, "200 g flour")).toContainText("you have 2 cups");
    await expect(item(page, /^salt/)).toContainText("have some");
  });
});
```

- [ ] **Step 2: Run the e2e suites**

Run: `pnpm test:e2e && pnpm test:e2e:sw`
Expected: PASS: the 26 earlier tests plus these 5, and the 3 service-worker tests.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "Add inventory end-to-end tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs and final checks

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`

- [ ] **Step 1: Roadmap**

In `docs/ROADMAP.md`:
- **Phase table:** set phase 4 to "In review", and phase 5 to "Next".
- **Backlog:**
  - Remove the ★ line about extending the re-parse script's "unused item" check, but keep a note that price records (phase 5) must be added to it.
  - Remove the Grocery list item "you can't type the amount you actually bought".
  - Add: "Inventory: re-parsing can move recipe lines to a new item key; stock under the old item stays put (`db/queries/maintenance.ts`)."
  - Add: "Inventory: checked extras aren't migrated from phase 3 (D27); re-check them if needed."
  - Log anything else deferred.

- [ ] **Step 2: Changelog**

Under `## [Unreleased]`, add a "Phase 4, inventory" block:
- **Added:**
  - an `/inventory` page and Inventory tab: add stock as "2 lb flour", edit it, remove it;
  - the grocery list buys only what stock doesn't cover;
  - checking off adds to stock, and unchecking takes it back;
  - marking a meal cooked takes its ingredients from stock, and un-cooking restores exactly what was taken;
  - "have some" and "you have 2 cups" hints;
  - changing a checked line's bought amount.
- **Changed:** the shortfall now comes from inventory, and checked marks from the current week were moved into inventory.

- [ ] **Step 3: Decisions**

Append:

```markdown
### D26. Inventory is keyed like grocery lines
One row per `(user, item, unit key)`, with quantities in base units (ml, g or a count) and a display `system`. Rows reaching 0 are deleted.
**Why:** the list subtracts stock line by line, and D17 already separates cans from loose tomatoes. Using the same key keeps the two consistent and makes the subtraction exact.
**Cost:** stock entered in cups doesn't cover a recipe in grams. The list shows a hint instead.

### D27. Shortfall comes from inventory, and phase 3's checked marks were moved into it
`shortfall = required − on hand`, replacing D18's `required − checked_qty`. A migration added checked item marks of the current and future weeks to inventory.
**Why:** checking off now adds to inventory (spec §5), so subtracting the mark as well would count purchases twice.
**Cost:** purchases from earlier weeks, and checked extras, aren't carried over.

### D28. Changing a bought amount happens after checking
Spec §5 lets the quantity be edited "before confirming". Foodini checks off instantly (and offline), and offers "Change amount" on a checked line instead, which moves inventory by the difference. It's online only.
**Why:** it keeps one-tap check-offs and offline sync simple.
**Cost:** two steps when the amount differs from what the list suggested.

### D29. Cooking records what it took, per stock key
`plan_entries.deducted` is `{ "<item_id>|<unitKey>": take }`, where take is the lesser of the scaled need and what's on hand. Un-cooking adds exactly that back. Repeating either does nothing.
**Why:** it makes the round trip exact, even with partial stock (spec §5).
**Cost:** editing the recipe after cooking doesn't change what un-cooking restores. That's the right behavior, but worth knowing.
```

- [ ] **Step 4: Full verification and commit**

Run:
- `pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e && pnpm test:e2e:sw`
- `NEXT_DIST_DIR=.next-ci pnpm build`, then `rm -rf .next-ci && git checkout -- tsconfig.json`
- `pnpm licenses list --prod`

Expected: all green, and no new licenses.

```bash
git add docs
git commit -m "Docs for phase 4: roadmap, changelog and decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
