import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the environment directly.
}

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // A separate port so it never collides with your own `pnpm dev`. Stop that first if Next
    // reports another dev server is already running in this directory.
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Lets the import test fetch its fixture from a local server; ignored in production.
    // Test users are created on @example.test; the outsider test uses another domain.
    env: { ...(process.env as Record<string, string>), IMPORT_ALLOW_PRIVATE: "1", ALLOWED_EMAILS: "@example.test" },
  },
});
