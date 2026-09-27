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
