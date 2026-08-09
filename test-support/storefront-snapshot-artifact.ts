import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  deserializeStorefrontSnapshot,
  serializeStorefrontSnapshot,
  type StorefrontSnapshot,
} from "@/test-support/storefront-baseline";

export const STOREFRONT_SNAPSHOT_ENV =
  "MEI_PELLE_STOREFRONT_SNAPSHOT_PATH";
export const STOREFRONT_SNAPSHOT_FILENAME = "storefront-baseline.json";

export async function writeStorefrontSnapshot(
  snapshot: StorefrontSnapshot,
  outputDirectory: string,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });
  const artifactPath = join(outputDirectory, STOREFRONT_SNAPSHOT_FILENAME);
  const temporaryPath = `${artifactPath}.tmp`;
  await writeFile(temporaryPath, serializeStorefrontSnapshot(snapshot), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, artifactPath);
  process.env[STOREFRONT_SNAPSHOT_ENV] = artifactPath;
  return artifactPath;
}

export async function loadStorefrontSnapshot(
  artifactPath = process.env[STOREFRONT_SNAPSHOT_ENV],
): Promise<StorefrontSnapshot> {
  if (!artifactPath) {
    throw new Error(
      "Storefront snapshot path is unavailable. Run the supported Playwright command so global setup can create it.",
    );
  }
  return deserializeStorefrontSnapshot(await readFile(artifactPath, "utf8"));
}
