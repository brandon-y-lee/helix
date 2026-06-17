import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Playwright runs in its own Node process and does not load .env.local (only
// the Next dev/start server does). Load it here so the seed check sees the same
// development Supabase credentials the app uses. Real process env wins.
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!match) continue; // skips blank lines and "# comment" lines
      const [, key] = match;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env.local — fall through to whatever is in the real environment.
  }
}

// Verify the development Supabase catalog is reachable and seeded BEFORE the
// browser tests run. This converts misconfiguration (missing env, missing
// tables, empty catalog, unreachable host) into a fast, clear failure instead
// of a long hang. The e2e suite relies on the seeded dev catalog — there is no
// static fallback.
//
// Uses PostgREST directly via fetch (not supabase-js) so this standalone Node
// process needs no WebSocket polyfill.
export default async function globalSetup(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "e2e: missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and set your dev Supabase credentials.",
    );
  }

  // Bound the network call so an unreachable host fails in ~10s, not minutes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${url}/rest/v1/products?select=slug`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
      signal: controller.signal,
    });

    if (!res.ok && res.status !== 206) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `e2e: catalog query failed (HTTP ${res.status}${body ? `: ${body}` : ""}). ` +
          `Apply the "catalog" and "seed_catalog" migrations to the dev Supabase ` +
          `project before running e2e.`,
      );
    }

    // PostgREST returns the total in the Content-Range header, e.g. "0-0/6".
    const contentRange = res.headers.get("content-range");
    const total = contentRange ? Number(contentRange.split("/")[1]) : NaN;

    if (!Number.isFinite(total) || total === 0) {
      throw new Error(
        'e2e: catalog is empty. Apply the "seed_catalog" migration to the dev ' +
          "Supabase project before running e2e.",
      );
    }

    console.log(`e2e global-setup: catalog reachable with ${total} products.`);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `e2e: Supabase did not respond within 10s at ${url}. ` +
          "Check NEXT_PUBLIC_SUPABASE_URL and network connectivity.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
