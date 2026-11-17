import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({test:{environment:"node",include:["scripts/db/production-marketing-readiness.integration.ts"],maxWorkers:1},
 resolve:{alias:{"@":resolve(import.meta.dirname,"../.."),"server-only":resolve(import.meta.dirname,"../../tests/mocks/server-only.ts")}}});
