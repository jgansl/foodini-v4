try {
  process.loadEnvFile(".env.local");
} catch {
  throw new Error("Integration tests need .env.local (see .env.example) and a running `pnpm exec supabase start`.");
}
