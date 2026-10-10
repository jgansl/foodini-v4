import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import { addDays, mondayOf, todayIn } from "@/lib/dates";
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
    const thisWeek = mondayOf(todayIn("UTC"));
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
