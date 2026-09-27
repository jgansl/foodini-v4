import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the environment directly.
}

const PORT = 3200;

// Service workers only register in production builds, so these tests run against `next build && next start`
// in their own build folder. Kept separate from the main suite because the build takes a while.
export default defineConfig({
  testDir: "tests/e2e-sw",
  workers: 1,
  use: { ...devices["Pixel 7"], baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", timezoneId: "America/Los_Angeles" },
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ...(process.env as Record<string, string>), NEXT_DIST_DIR: ".next-e2e-prod", ALLOWED_EMAILS: "@example.test" },
  },
});
