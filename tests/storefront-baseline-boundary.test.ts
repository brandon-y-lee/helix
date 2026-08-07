import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

describe("Storefront Baseline import boundary", () => {
  it("keeps application runtime modules out of the test/tooling namespace", async () => {
    const root = process.cwd();
    const files = (
      await Promise.all(
        ["app", "components", "lib"].map((directory) =>
          sourceFiles(resolve(root, directory)),
        ),
      )
    ).flat();
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (source.includes("test-support/")) {
        violations.push(relative(root, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
