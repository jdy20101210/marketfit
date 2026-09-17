import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      APP_SECRET: "test-secret-test-secret-test-secret-123456",
      MARKETFIT_DATA_DIR: path.resolve(import.meta.dirname, ".data-test"),
    },
  },
});
