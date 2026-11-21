import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/db/native-welcome-journey.integration.ts"],
    maxWorkers: 1,
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "../.."),
      "server-only": resolve(import.meta.dirname, "../../tests/mocks/server-only.ts"),
    },
  },
});
