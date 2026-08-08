import { createHash } from "node:crypto";

import type { Sha256Fingerprint } from "./routine-browser-verification";

const NON_SECRET_RUNTIME_CONFIGURATION_KEYS = [
  "NODE_ENV",
  "VERCEL_ENV",
  "VERCEL_URL",
] as const;

const PUBLIC_RUNTIME_CONFIGURATION_KEYS = [
  "NEXT_PUBLIC_ALGOLIA_APP_ID",
  "NEXT_PUBLIC_ALGOLIA_INDEX_NAME",
  "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

const REVIEWED_NON_RUNTIME_PATHS = new Set([
  ".github/PULL_REQUEST_TEMPLATE.md",
  "AGENTS.md",
  "CONTEXT-MAP.md",
  "README.md",
]);

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

export function sha256Fingerprint(contents: string): Sha256Fingerprint {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function fingerprint(value: unknown): Sha256Fingerprint {
  return sha256Fingerprint(canonicalJson(value));
}

export function fingerprintCatalog(facts: unknown): Sha256Fingerprint {
  return fingerprint(facts);
}

function isReviewedNonRuntimePath(path: string): boolean {
  return (
    path.startsWith(".claude/") ||
    path.startsWith("docs/") ||
    REVIEWED_NON_RUNTIME_PATHS.has(path)
  );
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
  const keys = [
    ...PUBLIC_RUNTIME_CONFIGURATION_KEYS,
    ...Object.keys(environment).filter((key) => key.startsWith("NEXT_PUBLIC_")),
    ...NON_SECRET_RUNTIME_CONFIGURATION_KEYS,
  ]
    .filter((key, index, values) => values.indexOf(key) === index)
    .sort();
  return fingerprint(
    Object.fromEntries(
      keys.map((key) => [key, environment[key] ?? ""]),
    ),
  );
}

export function canonicalizeVerificationValue(value: unknown): string {
  return canonicalJson(value);
}
