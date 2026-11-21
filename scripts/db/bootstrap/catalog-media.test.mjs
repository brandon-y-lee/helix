import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { catalogSeedMedia, developmentCatalogSeed } from "./catalog-media.mjs";

const files = new URL("../../../supabase/bootstrap/development/media/", import.meta.url);

test("a clean rehearsal verifies its repository fixtures without contacting development", async () => {
  const sql = await developmentCatalogSeed({
    mode: "local",
    fetchImpl: () => assert.fail("Unexpected request"),
  });
  assert.match(sql, /"mode":"local"/);
});

test("development verifies each exact owned object before emitting a seed", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    const proofUrl = new URL(url);
    assert.equal(proofUrl.origin, "https://zyfkunnpnlmgvrojmrbg.supabase.co");
    assert.match(proofUrl.searchParams.get("cacheNonce"), /^[a-f0-9-]{36}$/);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    const row = catalogSeedMedia().find((item) => item.url === proofUrl.origin + proofUrl.pathname);
    assert.ok(row);
    seen.push(row.url);
    const extension = row.media_type === "video" ? "mp4" : "webp";
    return new Response(await readFile(new URL(`catalog-test-pattern.${extension}`, files)), {
      headers: { "content-type": row.mime },
    });
  };
  assert.match(await developmentCatalogSeed({ mode: "development", fetchImpl }), /"mode":"development"/);
  assert.equal(new Set(seen).size, 11);
});

test("missing objects, wrong bytes and oversized bodies stop the seed", async () => {
  for (const response of [
    new Response(null, { status: 404 }),
    new Response(new Uint8Array(2510), { headers: { "content-type": "image/webp" } }),
    new Response(new Uint8Array(2511), { headers: { "content-type": "image/webp" } }),
  ]) {
    await assert.rejects(
      developmentCatalogSeed({ mode: "development", fetchImpl: async () => response }),
    );
  }
});
