import { resolve } from "node:path";
import { config } from "dotenv";
import { createStorefrontBaseline } from "../../test-support/storefront-baseline";
import { createSupabaseStorefrontCatalogAdapter } from "../../test-support/supabase-storefront-catalog";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function run(): Promise<void> {
  const snapshot = await createStorefrontBaseline(
    createSupabaseStorefrontCatalogAdapter({
      url: requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      anonKey: requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    }),
  );

  console.log(JSON.stringify({
    ok: true,
    generatedAt: new Date().toISOString(),
    eligibleProducts: snapshot.products.map(({ id, slug }) => ({ id, slug })),
    routineComplementCount: snapshot.routineComplements.length,
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
