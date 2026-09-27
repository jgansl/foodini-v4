import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createTestUser, deleteTestUser, signedInClient, type TestUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = () => new Blob([PNG], { type: "image/png" });

let alice: TestUser;
let bob: TestUser;
let aliceDb: SupabaseClient;
let bobDb: SupabaseClient;
let recipeId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
  [aliceDb, bobDb] = await Promise.all([signedInClient(alice), signedInClient(bob)]);
  const { data, error } = await aliceDb.from("recipes").insert({ user_id: alice.id, title: "Alice's soup", servings: 2 }).select("id").single();
  if (error) throw error;
  recipeId = data.id;
});

afterAll(async () => {
  await Promise.all([deleteTestUser(alice.id), deleteTestUser(bob.id)]);
});

describe("row-level security", () => {
  it("lets the owner read their recipe", async () => {
    const { data } = await aliceDb.from("recipes").select("id").eq("id", recipeId);
    expect(data).toHaveLength(1);
  });

  it("hides another user's recipe", async () => {
    const { data, error } = await bobDb.from("recipes").select("id").eq("id", recipeId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ignores updates to another user's recipe", async () => {
    await bobDb.from("recipes").update({ title: "pwned" }).eq("id", recipeId);
    const { data } = await aliceDb.from("recipes").select("title").eq("id", recipeId).single();
    expect(data?.title).toBe("Alice's soup");
  });

  it("refuses rows inserted on someone else's behalf", async () => {
    const { error } = await bobDb.from("recipes").insert({ user_id: alice.id, title: "x", servings: 1 });
    expect(error).not.toBeNull();
  });

  it("hides items from other users", async () => {
    const { error } = await aliceDb.from("items").insert({ user_id: alice.id, name: "egg", key: "egg", section: "dairy & eggs", unit_kind: "count" });
    expect(error).toBeNull();
    const { data } = await bobDb.from("items").select("id");
    expect(data).toEqual([]);
  });

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

  it("gives the anonymous role nothing", async () => {
    const { data } = await anonClient().from("recipes").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("keeps photos private per user", async () => {
    const path = `${alice.id}/${recipeId}/test.png`;
    expect((await aliceDb.storage.from("recipe-photos").upload(path, png())).error).toBeNull();
    expect((await bobDb.storage.from("recipe-photos").download(path)).error).not.toBeNull();
    expect((await bobDb.storage.from("recipe-photos").upload(`${alice.id}/${recipeId}/evil.png`, png())).error).not.toBeNull();
    await aliceDb.storage.from("recipe-photos").remove([path]);
  });
});
