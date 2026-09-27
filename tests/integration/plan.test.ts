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
