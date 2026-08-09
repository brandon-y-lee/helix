import { createHash } from "node:crypto";

export const NON_SECRET_RUNTIME_KEYS = [
  "CHECKOUT_ENABLED",
  "CHECKOUT_MODE",
  "NEXT_PUBLIC_ALGOLIA_APP_ID",
  "NEXT_PUBLIC_ALGOLIA_INDEX_NAME",
  "NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STRIPE_AUTOMATIC_TAX_ENABLED",
];

export function fingerprint(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function createRuntimeIdentity({ commitSha, environment, nodeVersion }) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error("Scheduled verification requires an exact runtime commit.");
  }
  return JSON.stringify({
    commitSha,
    configuration: Object.fromEntries(
      NON_SECRET_RUNTIME_KEYS.map((key) => [key, environment[key] ?? ""]),
    ),
    node: nodeVersion,
  });
}
