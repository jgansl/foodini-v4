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
