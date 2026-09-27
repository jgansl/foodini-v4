import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI): rely on the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
