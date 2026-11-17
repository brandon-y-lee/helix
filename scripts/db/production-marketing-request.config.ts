import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Explicitly invoked by the owned PostgreSQL harness, never the ordinary Vitest gate.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/db/production-marketing-request.integration.ts"],
    maxWorkers: 1,
  },
  resolve: { alias: {
    "@": resolve(import.meta.dirname, "../.."),
    "server-only": resolve(import.meta.dirname, "../../tests/mocks/server-only.ts"),
  } },
});
