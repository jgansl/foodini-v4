import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import {
  addGroceryExtra,
  applyGroceryChanges,
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
import type { RecipeInput } from "@/lib/recipe-input";
import { formatAmount } from "@/lib/units";
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

const shelf = async (userId: string) => (await listInventory(userId)).map((r) => `${formatAmount(r.unitKey, r.quantity, r.system)} ${r.name}`);
const firstLine = async (userId: string) => (await getGroceryList(userId, WEEK)).sections[0].lines[0];

async function planned(userId: string, lines: string[], servings = 4) {
  const r = await createRecipe(userId, recipe("Bake", lines, servings));
  const entry = await addPlanEntry(userId, { recipeId: r, date: "2026-09-29", servings: null, label: null });
  if (!entry) throw new Error("plan failed");
  return entry;
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
    const after = await listInventory(u.id);
    expect(after.map((r) => [r.itemId, r.unitKey])).toEqual(before.map((r) => [r.itemId, r.unitKey]));
    expect(after[0].quantity).toBeCloseTo(before[0].quantity, 6);
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

  it("two concurrent checks of one line add the shortfall once", async () => {
    const u = await newUser();
    await planned(u.id, ["4 cups flour"]);
    const line = await firstLine(u.id);
    const results = await Promise.all([checkGroceryLine(u.id, WEEK, line.key), checkGroceryLine(u.id, WEEK, line.key)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await shelf(u.id)).toEqual(["4 cups flour"]);
    await uncheckGroceryLine(u.id, WEEK, line.key);
    expect(await shelf(u.id)).toEqual([]);
  });

  it("two meals cooked at once never record more than was on hand", async () => {
    const u = await newUser();
    const a = await planned(u.id, ["4 cups flour"]);
    const b = await planned(u.id, ["4 cups flour"]);
    await addStockFromText(u.id, "4 cups flour");
    await Promise.all([setPlanEntryCooked(u.id, a, true), setPlanEntryCooked(u.id, b, true)]);
    expect(await shelf(u.id)).toEqual([]);
    await Promise.all([setPlanEntryCooked(u.id, a, false), setPlanEntryCooked(u.id, b, false)]);
    expect(await shelf(u.id)).toEqual(["4 cups flour"]);
  });

  it("unchecking a mark or extra that never added stock leaves inventory alone", async () => {
    const u = await newUser();
    await addStockFromText(u.id, "3 cups flour");
    const [flour] = await listInventory(u.id);
    await sqlClient`insert into grocery_marks (user_id, week_start, key, checked, checked_qty)
      values (${u.id}, '2026-09-21', ${`item:${flour.itemId}:volume`}, true, 473.176)`;
    await uncheckGroceryLine(u.id, "2026-09-21", `item:${flour.itemId}:volume`);
    const [extra] = await sqlClient<{ id: string }[]>`insert into grocery_extras (user_id, week_start, item_id, name, quantity, unit, checked)
      values (${u.id}, ${WEEK}, ${flour.itemId}, 'flour', 2, 'cup', true) returning id`;
    await setGroceryExtraChecked(u.id, extra.id, false);
    expect(await shelf(u.id)).toEqual(["3 cups flour"]);
  });

  it("unchecking after a partial cook shrinks what un-cooking restores", async () => {
    const u = await newUser();
    const a = await planned(u.id, ["2 cups flour"]);
    await planned(u.id, ["2 cups flour"]);
    const line = await firstLine(u.id);
    await checkGroceryLine(u.id, WEEK, line.key);
    expect(await shelf(u.id)).toEqual(["4 cups flour"]);
    await setPlanEntryCooked(u.id, a, true);
    expect(await shelf(u.id)).toEqual(["2 cups flour"]);
    await uncheckGroceryLine(u.id, WEEK, line.key);
    expect(await shelf(u.id)).toEqual([]);
    await setPlanEntryCooked(u.id, a, false);
    expect(await shelf(u.id)).toEqual([]);
  });

  it("ignores a re-sent check with the timestamp already applied", async () => {
    const u = await newUser();
    await planned(u.id, ["2 cups flour"]);
    const line = await firstLine(u.id);
    const at = Date.now();
    const change = { kind: "line" as const, week: WEEK, key: line.key, checked: true, at };
    await applyGroceryChanges(u.id, [change]);
    await removeStock(u.id, (await listInventory(u.id))[0].itemId, "volume");
    expect((await applyGroceryChanges(u.id, [change]))[0].status).toBe("stale");
    expect(await shelf(u.id)).toEqual([]);
  });
});
