import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PDP data-flow report", () => {
  it("keeps the maintained report connected to current runtime entry points", () => {
    const report = readFileSync(
      resolve(process.cwd(), "docs/pdp/pdp-data-flow.md"),
      "utf8",
    );

    for (const heading of [
      "# Mei Pelle PDP data flow",
      "## Executive summary",
      "## Read-path diagram",
      "## Product-field matrix",
      "## Media flow",
      "## Cache and revalidation",
      "## Algolia flow",
      "## Cart and checkout flow",
      "## Static and repository-owned PDP content",
      "## New modules from this task",
      "## Failure behavior",
      "## Risks and recommendations",
    ]) {
      expect(report).toContain(heading);
    }

    for (const runtimeReference of [
      "app/products/[slug]/page.tsx",
      "lib/catalog-cache.ts",
      "lib/catalog.ts",
      "lib/algolia/source.ts",
      "lib/algolia/record.ts",
      "lib/cart/server.ts",
      "PdpRoutineVideo",
      "PdpProfileSplit",
      "PdpOutcomeSplit",
      "routine_video",
      "routine_video_poster",
      "profile_editorial",
    ]) {
      expect(report).toContain(runtimeReference);
    }
  });
});
