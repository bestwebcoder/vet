import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";

// Vitest does not read .env files on its own, and Vite only exposes VITE_*
// prefixed variables. Load the project's env explicitly so tests run against
// the same configuration the app does.
const env = loadEnv("test", process.cwd(), "");
Object.assign(process.env, env);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Starts the app once for the whole run; route tests need it serving.
    globalSetup: ["./tests/setup/test-server.ts"],
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
