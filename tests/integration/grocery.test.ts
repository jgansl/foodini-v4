import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import {
  addGroceryExtra,
  applyGroceryChanges,
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

  it("applies synced changes with the device's timestamp", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, recipe("Soup", ["2 cups stock"]));
    await plan(u.id, r);
    const [lineOnList] = (await getGroceryList(u.id, WEEK)).sections[0].lines;
    const extraId = (await addGroceryExtra(u.id, WEEK, "paper towels"))!;
    const now = Date.now();
    const results = await applyGroceryChanges(u.id, [
      { kind: "line", week: WEEK, key: lineOnList.key, checked: true, at: now },
      { kind: "extra", week: WEEK, id: extraId, checked: true, at: now },
    ]);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(await labels(u.id)).toEqual(["✓ 2 cups stock", "✓ paper towels"]);
  });

  it("ignores changes older than the row", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, recipe("Soup", ["2 cups stock"]));
    await plan(u.id, r);
    const [lineOnList] = (await getGroceryList(u.id, WEEK)).sections[0].lines;
    const extraId = (await addGroceryExtra(u.id, WEEK, "paper towels"))!;
    const now = Date.now();
    await applyGroceryChanges(u.id, [
      { kind: "line", week: WEEK, key: lineOnList.key, checked: true, at: now },
      { kind: "extra", week: WEEK, id: extraId, checked: true, at: now },
    ]);
    const older = await applyGroceryChanges(u.id, [
      { kind: "line", week: WEEK, key: lineOnList.key, checked: false, at: now - 60_000 },
      { kind: "extra", week: WEEK, id: extraId, checked: false, at: now - 60_000 },
    ]);
    expect(older.map((r) => r.status)).toEqual(["stale", "stale"]);
    expect(await labels(u.id)).toEqual(["✓ 2 cups stock", "✓ paper towels"]);
  });

  it("marks invalid changes: bad week or key, and another user's extra", async () => {
    const [u, other] = await Promise.all([newUser(), newUser()]);
    const theirs = (await addGroceryExtra(other.id, WEEK, "towels"))!;
    const now = Date.now();
    const results = await applyGroceryChanges(u.id, [
      { kind: "line", week: "2026-09-29", key: "item:x:volume", checked: true, at: now },
      { kind: "line", week: WEEK, key: "extra:x", checked: true, at: now },
      { kind: "extra", week: WEEK, id: theirs, checked: true, at: now },
    ]);
    expect(results.map((r) => r.status)).toEqual(["invalid", "invalid", "invalid"]);
    expect(await labels(other.id)).toEqual(["towels"]);
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
