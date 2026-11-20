import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Use the owned CLI stack's PostgREST build with the bootstrapped clone.
// The CLI's normal gateway always reads its original 'postgres' database.
export async function verifyLocalCatalogApi(stack, database) {
  assert.match(stack.nonce, /^[a-f0-9]{12}$/);
  assert.equal(database, "helix_bootstrap_fresh_a_" + stack.nonce);
  assert.match(stack.container, /^[0-9a-f]{64}$/);
  const inspect = (id, field) =>
    stack.docker(["inspect", "--format", field, id]).stdout.toString().trim();
  const stackId = inspect(stack.container, '{{index .Config.Labels "com.supabase.stack"}}');
  assert.match(stackId, /^[a-zA-Z0-9_-]+$/);
  const apiService = stack
    .docker([
      "ps",
      "-q",
      "--no-trunc",
      "--filter",
      "label=com.supabase.stack=" + stackId,
      "--filter",
      "label=com.supabase.service=rest",
    ])
    .stdout.toString()
    .trim();
  assert.match(apiService, /^[0-9a-f]{64}$/, "Expected the owned stack's single PostgREST service.");
  const image = inspect(apiService, "{{.Image}}");
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const databasePort = Number(stack.sql(database, "show port;").stdout.toString().trim());
  assert.ok(Number.isInteger(databasePort) && databasePort > 0 && databasePort <= 65535);
  const role = "helix_seed_rest_" + stack.nonce;
  const password = randomBytes(24).toString("hex");
  const port = randomInt(40000, 60000);
  const name = "helix-catalog-api-" + stack.nonce;
  const label = "helix.bootstrap-catalog-api";
  let createdRole = false;
  let container;
  try {
    stack.sql(
      database,
      `begin; create role ${role} login noinherit password '${password}'; grant anon to ${role}; commit;`,
    );
    createdRole = true;
    container = stack
      .docker([
        "run",
        "--detach",
        "--pull=never",
        "--read-only",
        "--network",
        "container:" + stack.container,
        "--name",
        name,
        "--label",
        label + "=" + stack.nonce,
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "-e",
        `PGRST_DB_URI=postgresql://${role}:${password}@127.0.0.1:${databasePort}/${database}`,
        "-e",
        "PGRST_DB_ANON_ROLE=anon",
        "-e",
        "PGRST_DB_SCHEMAS=public",
        "-e",
        "PGRST_SERVER_HOST=127.0.0.1",
        "-e",
        "PGRST_SERVER_PORT=" + port,
        "-e",
        "PGRST_DB_POOL=1",
        image,
      ])
      .stdout.toString()
      .trim();
    assert.match(container, /^[a-f0-9]{64}$/);
    const read = async (slug, select) => {
      const query = new URLSearchParams({ select, slug: "eq." + slug, catalog_status: "eq.active" });
      const url = `http://127.0.0.1:${port}/products?${query}`;
      for (let attempt = 0; attempt < 24; attempt++) {
        const response = stack.exec(["/usr/bin/wget", "-qO-", "-T", "2", url], undefined, true);
        if (response.status === 0) {
          const rows = JSON.parse(response.stdout);
          assert.equal(rows.length, 1, "Expected one active anonymous development Product.");
          return rows[0];
        }
        await delay(200);
      }
      throw Error("The owned PostgREST service could not read the seeded Catalog relationship.");
    };
    const cold = await read(
      "dev-preparation-pads",
      "slug,product_family_memberships!product_family_memberships_product_id_fkey(is_entry),product_variants(available)",
    );
    assert.equal(cold.slug, "dev-preparation-pads");
    // The unique membership per Product makes this a PostgREST to-one embed.
    assert.deepEqual(cold.product_family_memberships, { is_entry: false });
    assert.deepEqual(cold.product_variants, [{ available: false }]);
    const serum = await read("dev-serum", "id,system_steps(name),product_media(role,url)");
    assert.deepEqual(serum.system_steps, { name: "TREAT" });
    assert.deepEqual(serum.product_media.map((row) => row.role).sort(), [
      "card_default",
      "core_routine_texture",
      "gallery",
      "routine_video",
      "routine_video_poster",
    ]);
    assert.ok(
      serum.product_media.every((row) =>
        row.url.startsWith(
          `https://zyfkunnpnlmgvrojmrbg.supabase.co/storage/v1/object/public/helix-catalog/products/${serum.id}/`,
        ),
      ),
    );
  } finally {
    if (container) {
      assert.equal(inspect(container, '{{index .Config.Labels "' + label + '"}}'), stack.nonce);
      stack.docker(["rm", "--force", "--volumes", container]);
    }
    if (createdRole) stack.sql(database, "drop role " + role + ";");
  }
}
