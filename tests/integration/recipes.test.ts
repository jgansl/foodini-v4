import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, listTags, updateRecipe } from "@/db/queries/recipes";
import type { RecipeInput } from "@/lib/recipe-input";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

const base: RecipeInput = {
  title: "Pancakes",
  servings: 4,
  ingredients: ["2 cups flour", "2 large eggs", "Salt to taste", "For the batter:"],
  steps: ["Whisk.", "Cook."],
  tags: ["breakfast"],
  sourceUrl: null,
  notes: null,
};

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

describe("recipe queries", () => {
  it("creates a recipe with parsed ingredients linked to items", async () => {
    const u = await newUser();
    const id = await createRecipe(u.id, base);
    const recipe = await getRecipe(u.id, id);
    expect(recipe).toMatchObject({ id, title: "Pancakes", servings: 4, steps: ["Whisk.", "Cook."], tags: ["breakfast"], imagePath: null, sourceUrl: null, notes: null });
    expect(recipe!.ingredients.map((i) => [i.position, i.rawText, i.quantity, i.unit, i.note, i.itemId !== null])).toEqual([
      [0, "2 cups flour", 2, "cup", null, true],
      [1, "2 large eggs", 2, null, "large", true],
      [2, "Salt to taste", null, null, "to taste", true],
      [3, "For the batter:", null, null, null, false],
    ]);
  });

  it("stores a new item with its section and unit kind", async () => {
    const u = await newUser();
    await createRecipe(u.id, { ...base, ingredients: ["2 cups flour", "3 Eggs"] });
    const rows = await sqlClient<{ key: string; name: string; section: string; unit_kind: string }[]>`
      select key, name, section, unit_kind from items where user_id = ${u.id} order by key`;
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { key: "egg", name: "eggs", section: "dairy & eggs", unit_kind: "count" },
      { key: "flour", name: "flour", section: "pantry", unit_kind: "volume" },
    ]);
  });

  it("reuses one item across recipes regardless of case and plural", async () => {
    const u = await newUser();
    const a = await createRecipe(u.id, { ...base, title: "A", ingredients: ["3 Eggs"] });
    const b = await createRecipe(u.id, { ...base, title: "B", ingredients: ["1 egg"] });
    const [ra, rb] = await Promise.all([getRecipe(u.id, a), getRecipe(u.id, b)]);
    expect(ra!.ingredients[0].itemId).not.toBeNull();
    expect(ra!.ingredients[0].itemId).toBe(rb!.ingredients[0].itemId);
  });

  it("keeps items separate per user", async () => {
    const [u1, u2] = await Promise.all([newUser(), newUser()]);
    const [a, b] = await Promise.all([createRecipe(u1.id, { ...base, ingredients: ["1 egg"] }), createRecipe(u2.id, { ...base, ingredients: ["1 egg"] })]);
    const [ra, rb] = await Promise.all([getRecipe(u1.id, a), getRecipe(u2.id, b)]);
    expect(ra!.ingredients[0].itemId).not.toBe(rb!.ingredients[0].itemId);
  });

  it("filters by title text, treating % and _ literally", async () => {
    const u = await newUser();
    await createRecipe(u.id, { ...base, title: "100% whole wheat bread" });
    await createRecipe(u.id, { ...base, title: "Rye bread" });
    expect((await listRecipes(u.id, { q: "100%" })).map((r) => r.title)).toEqual(["100% whole wheat bread"]);
    expect(await listRecipes(u.id, { q: "_" })).toEqual([]);
    expect((await listRecipes(u.id, { q: "BREAD" })).map((r) => r.title).sort()).toEqual(["100% whole wheat bread", "Rye bread"]);
  });

  it("filters by tag, lists distinct tags and orders newest first", async () => {
    const u = await newUser();
    await createRecipe(u.id, { ...base, title: "Soup", tags: ["dinner", "soup"] });
    await createRecipe(u.id, { ...base, title: "Toast", tags: ["breakfast"] });
    expect((await listRecipes(u.id, { tag: "soup" })).map((r) => r.title)).toEqual(["Soup"]);
    expect((await listRecipes(u.id)).map((r) => r.title)).toEqual(["Toast", "Soup"]);
    expect(await listTags(u.id)).toEqual(["breakfast", "dinner", "soup"]);
  });

  it("updates fields and replaces ingredients", async () => {
    const u = await newUser();
    const id = await createRecipe(u.id, base);
    expect(await updateRecipe(u.id, id, { ...base, title: "Crepes", ingredients: ["1 cup milk"] }, `${u.id}/${id}/p.png`)).toBe(true);
    const recipe = await getRecipe(u.id, id);
    expect(recipe).toMatchObject({ title: "Crepes", imagePath: `${u.id}/${id}/p.png` });
    expect(recipe!.ingredients.map((i) => i.rawText)).toEqual(["1 cup milk"]);
  });

  it("never reads, updates or deletes another user's recipe", async () => {
    const [owner, other] = await Promise.all([newUser(), newUser()]);
    const id = await createRecipe(owner.id, base);
    expect(await getRecipe(other.id, id)).toBeNull();
    expect(await updateRecipe(other.id, id, { ...base, title: "Stolen" }, null)).toBe(false);
    expect(await deleteRecipe(other.id, id)).toBeNull();
    expect((await getRecipe(owner.id, id))?.title).toBe("Pancakes");
    expect(await listRecipes(other.id)).toEqual([]);
  });

  it("returns null for ids that are not UUIDs", async () => {
    const u = await newUser();
    expect(await getRecipe(u.id, "not-a-uuid")).toBeNull();
    expect(await updateRecipe(u.id, "not-a-uuid", base, null)).toBe(false);
    expect(await deleteRecipe(u.id, "not-a-uuid")).toBeNull();
  });

  it("creates with a caller-supplied id and image path", async () => {
    const u = await newUser();
    const id = crypto.randomUUID();
    expect(await createRecipe(u.id, base, { id, imagePath: `${u.id}/${id}/a.jpg` })).toBe(id);
    expect((await getRecipe(u.id, id))?.imagePath).toBe(`${u.id}/${id}/a.jpg`);
  });

  it("deletes a recipe and its ingredients", async () => {
    const u = await newUser();
    const id = await createRecipe(u.id, base);
    expect(await deleteRecipe(u.id, id)).toEqual({ status: "deleted", imagePath: null });
    expect(await getRecipe(u.id, id)).toBeNull();
    const [{ n }] = await sqlClient<{ n: number }[]>`select count(*)::int as n from recipe_ingredients where recipe_id = ${id}`;
    expect(n).toBe(0);
  });
});
