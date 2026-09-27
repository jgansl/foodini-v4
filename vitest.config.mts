import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("."),
      // `server-only` throws outside the React Server environment; tests import server modules directly.
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["lib/**/*.test.ts"], environment: "node" },
      },
    ],
  },
});
