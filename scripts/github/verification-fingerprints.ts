import { createHash } from "node:crypto";

import type { Sha256Fingerprint } from "./routine-browser-verification";

const NON_SECRET_CONFIGURATION_KEYS = [
  "NEXT_PUBLIC_ALGOLIA_APP_ID",
  "NEXT_PUBLIC_ALGOLIA_INDEX_NAME",
  "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fingerprint(value: unknown): Sha256Fingerprint {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function fingerprintCatalog(facts: unknown): Sha256Fingerprint {
  return fingerprint(facts);
}

function isReviewedNonRuntimePath(path: string): boolean {
  return path.startsWith("docs/") || path.endsWith(".md");
}

export function fingerprintRuntimeFiles(
  files: readonly { contents: string; path: string }[],
): Sha256Fingerprint {
  return fingerprint(
    files
      .filter(({ path }) => !isReviewedNonRuntimePath(path))
      .map(({ contents, path }) => ({ contents, path }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  );
}

export function fingerprintConfiguration(
  environment: Partial<Record<string, string | undefined>>,
): Sha256Fingerprint {
  return fingerprint(
    Object.fromEntries(
      NON_SECRET_CONFIGURATION_KEYS.map((key) => [key, environment[key] ?? ""]),
    ),
  );
}

export function canonicalizeVerificationValue(value: unknown): string {
  return canonicalJson(value);
}
