import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_PROJECT_REF = "erasogmsqpgiirovubjh";
const REQUIRED_PRODUCTS = [
  "cleanse-01-calming-gel-cleanser",
  "refine-02-pore-treatment-pads",
  "treat-03-pdrn-5-ampoule",
  "frame-04-pdrn-eye-cream",
  "seal-05-green-collagen-cream",
  "lift-06-pdrn-mask-system",
] as const;

type CatalogRecord = {
  slug: string;
  product_media: Array<{ role: string; url: string | null }>;
  product_variants: Array<{ available: boolean; label: string }>;
};

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

  const projectHost = new URL(url).hostname;
  if (!projectHost.startsWith(`${EXPECTED_PROJECT_REF}.`)) {
    throw new Error(
      `e2e: refusing Supabase project "${projectHost}". Expected the verified ` +
        `non-production project ${EXPECTED_PROJECT_REF}.`,
    );
  }

  // Bound the network call so an unreachable host fails in ~10s, not minutes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const query = new URLSearchParams({
      select:
        "slug,product_variants(label,available),product_media(role,url)",
      slug: `in.(${REQUIRED_PRODUCTS.join(",")})`,
    });
    const res = await fetch(`${url}/rest/v1/products?${query}`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `e2e: catalog query failed (HTTP ${res.status}${body ? `: ${body}` : ""}). ` +
          `Apply the "catalog" and "seed_catalog" migrations to the dev Supabase ` +
          `project before running e2e.`,
      );
    }

    const products = (await res.json()) as CatalogRecord[];
    const bySlug = new Map(products.map((product) => [product.slug, product]));
    const missingProducts = REQUIRED_PRODUCTS.filter((slug) => !bySlug.has(slug));
    if (missingProducts.length > 0) {
      throw new Error(
        `e2e: catalog is missing required products: ${missingProducts.join(", ")}. ` +
          "Apply the current catalog seed migrations before running e2e.",
      );
    }

    const productsWithoutVariants = products
      .filter(
        (product) =>
          !product.product_variants.some(
            (variant) => variant.available && variant.label.length > 0,
          ),
      )
      .map((product) => product.slug);
    if (productsWithoutVariants.length > 0) {
      throw new Error(
        `e2e: required products have no available variant: ` +
          productsWithoutVariants.join(", "),
      );
    }

    const treat = bySlug.get("treat-03-pdrn-5-ampoule");
    const treatRoles = new Set(
      treat?.product_media
        .filter(
          (media) => typeof media.url === "string" && media.url.length > 0,
        )
        .map((media) => media.role),
    );
    const missingTreatMedia = ["routine_video", "routine_video_poster"].filter(
      (role) => !treatRoles.has(role),
    );
    if (
      !treat?.product_variants.some(
        (variant) => variant.available && variant.label === "30 mL",
      ) ||
      missingTreatMedia.length > 0
    ) {
      throw new Error(
        `e2e: TREAT is missing its available 30 mL variant or required media ` +
          `roles (${missingTreatMedia.join(", ") || "none"}).`,
      );
    }

    console.log(
      `e2e global-setup: verified ${products.length} required products, ` +
        "available variants, and TREAT editorial media.",
    );
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
