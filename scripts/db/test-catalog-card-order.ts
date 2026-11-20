import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getProductCardContents } from "@/lib/catalog/storefront";
import { supabaseOriginForTarget } from "@/lib/supabase/project-safety";
import { withLocalCatalogApi } from "./bootstrap/catalog-api.mjs";
import { developmentCatalogSeed } from "./bootstrap/catalog-media.mjs";
import { localStack } from "./bootstrap/local-stack.mjs";

const fixture = `
  insert into public.products
    (id, slug, display_name, product_type, editorial_description, editorial_how_to_use,
     swatch_from, swatch_to, sort_order, routine_group, routine_sort, system_step_name)
    values
    ('56300000-0000-4000-8000-000000000002','dev-tie-high','High UUID','Test gel','','',
     '#ffffff','#aaaaaa',6,'beyond_core',6,'REFINE'),
    ('56300000-0000-4000-8000-000000000001','dev-tie-low','Low UUID','Test gel','','',
     '#ffffff','#aaaaaa',6,'beyond_core',6,'REFINE');
  analyze public.products;
`;

const checkout = (filename: string) => readFileSync(filename, "utf8");
const schema = (...args: string[]) => execFileSync(
  process.execPath,
  ["scripts/db/bootstrap/render-development-schema.mjs", ...args],
  { encoding: "utf8", maxBuffer: 4_000_000 },
);
const expected = [
  "dev-cleanser", "dev-serum", "dev-moisturizer", "dev-preparation-gel",
  "dev-tie-low", "dev-tie-high",
];

type Plan = { "Relation Name"?: string; "Index Name"?: string; Plans?: Plan[] };
type ReadProducts = (query: URLSearchParams, explain?: boolean) => Promise<string>;
function productIndex(plan: Plan): string | undefined {
  if (plan["Relation Name"] === "products") return plan["Index Name"];
  return plan.Plans?.map(productIndex).find(Boolean);
}

async function main() {
  const stack = localStack();
  const database = "helix_bootstrap_fresh_a_" + stack.nonce;
  const sql = (query: string) => stack.sql(database, query);
  const origin = supabaseOriginForTarget("development");
  const originalFetch = globalThis.fetch;
  // The storefront keeps its normal deployment binding. Only its HTTP transport
  // is substituted, and can reach only the owned anonymous PostgREST sidecar.
  process.env.NEXT_PUBLIC_HELIX_SUPABASE_TARGET = "development";
  process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_local_card_order_fixture";
  try {
    stack.start();
    stack.restore(stack.backup("postgres"), database);
    sql([
      "SET SESSION AUTHORIZATION postgres; BEGIN; SET LOCAL helix.bootstrap_scope='local-clean-rehearsal';",
      schema(),
      checkout("supabase/bootstrap/development/auth-hooks.sql"),
      schema("--dev-changes"),
      await developmentCatalogSeed({ mode: "local" }),
      fixture,
      "COMMIT;",
    ].join("\n"));
    // On this small fixture normal costing favors a sequential scan. Use the
    // local DB's real ordered indexes to expose a different valid tie order.
    sql(`ALTER DATABASE ${database} SET enable_seqscan=off;
         ALTER DATABASE ${database} SET enable_bitmapscan=off;
         ALTER DATABASE ${database} SET enable_sort=off;`);
    const { verify } = JSON.parse(checkout("supabase/releases/20261120141910_index_stable_catalog_product_order.json"));
    const indexInstalled = () => sql(`BEGIN READ ONLY; ${verify}; ROLLBACK;`).stdout.toString().trim();
    assert.equal(indexInstalled(), "f");
    await withLocalCatalogApi(stack, database, async (readProducts: ReadProducts) => {
      let legacy = false;
      let requestQuery: URLSearchParams;
      globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        assert.equal(url.origin, origin);
        assert.equal(url.pathname, "/rest/v1/products");
        assert.equal(init?.method ?? "GET", "GET");
        if (legacy) {
          // Run the old reader's wire query through precisely the same embeds,
          // permissions, mapping and family admission as the shipped reader.
          const order = url.searchParams.get("order");
          assert.ok(order);
          url.searchParams.set("order", order.split(",").filter((key) => key !== "id.asc").join(","));
        }
        requestQuery = url.searchParams;
        return new Response(await readProducts(url.searchParams), {
          headers: { "content-type": "application/json" },
        });
      };
      const read = async (oldReader: boolean) => {
        legacy = oldReader;
        const cards = await getProductCardContents();
        assert.deepEqual(cards.map((card) => card.sortOrder), [1, 2, 3, 4, 6, 6]);
        assert.ok(!cards.some((card) => card.slug === "dev-preparation-pads"));
        return cards.map((card) => card.slug);
      };
      const oldBefore = await read(true);
      const explainIndex = async () => productIndex(JSON.parse(await readProducts(requestQuery, true))[0].Plan);
      const beforeIndex = await explainIndex();
      assert.deepEqual(await read(false), expected, "Unindexed storefront must break ties by Product UUID");
      sql("CREATE INDEX products_catalog_status_sort_id_idx ON public.products USING btree (catalog_status, sort_order, id);");
      assert.equal(indexInstalled(), "t", "Index must satisfy the release migration's own postcondition");
      const oldAfter = await read(true);
      const afterIndex = await explainIndex();
      assert.equal(beforeIndex, "products_catalog_status_sort_idx");
      assert.equal(afterIndex, "products_catalog_status_sort_id_idx");
      assert.notDeepEqual(oldBefore, oldAfter, "Fixture did not witness the two legal old-reader orders");
      assert.deepEqual(await read(false), expected, "Indexed storefront must return the same visible cards");
      console.log(JSON.stringify({ beforeIndex, afterIndex, oldBefore, oldAfter, stableWithAndWithoutIndex: expected }));
    });
  } finally {
    globalThis.fetch = originalFetch;
    stack.cleanup();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
