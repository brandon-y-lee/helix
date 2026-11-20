import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const directory = new URL("../../../supabase/bootstrap/development/", import.meta.url);
const project = "zyfkunnpnlmgvrojmrbg";
const storage = `https://${project}.supabase.co/storage/v1/object/public/helix-catalog/`;

// ffprobe reports 64 × 48 for both checked-in test patterns. Exact digest comparison
// preserves dimensions as well as the complete image or video stream.
const image = {
  type: "image/webp",
  extension: "webp",
  bytes: 2510,
  hash: "4e9d6778b389b218181d0ee97a16ec3dc22836066c153183d9708aaf24bfc085",
};
const video = {
  type: "video/mp4",
  extension: "mp4",
  bytes: 2837,
  hash: "5e369c16b14292179d19dfb9f626933a8ca283e634c259846da8e7de9b990fd7",
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function catalogSeedMedia() {
  const rows = [];
  function add(product, slot, role, folder, asset = image) {
    const productId = `55900000-0000-4000-8000-${String(product).padStart(12, "0")}`;
    const path = `products/${productId}/${folder}/${asset.hash}.${asset.extension}`;
    rows.push({
      id: `55900002-0000-4000-8000-${String(product * 100 + slot).padStart(12, "0")}`,
      product_id: productId,
      media_type: asset === video ? "video" : "image",
      url: storage + path,
      alt: "Synthetic development test pattern",
      role,
      sort_order: slot,
      width: 64,
      height: 48,
      path,
      mime: asset.type,
      bytes: asset.bytes,
      sha256: asset.hash,
    });
  }
  for (const product of [1, 2, 3, 4, 5]) {
    add(product, 0, "card_default", "primary");
    if (product <= 3) add(product, 24, "core_routine_texture", "core-routine-texture");
  }
  add(2, 6, "gallery", "gallery");
  add(2, 7, "routine_video", "routine", video);
  add(2, 8, "routine_video_poster", "routine");
  return rows;
}

async function verifyStoredObject(row, request) {
  // Match the existing catalog media verifier's CDN-fresh origin proof.
  // The stored Catalog URL remains the canonical, bare object URL.
  const proofUrl = new URL(row.url);
  proofUrl.searchParams.set("cacheNonce", randomUUID());
  const response = await request(proofUrl, {
    headers: { "Accept-Encoding": "identity", "Cache-Control": "no-cache" },
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  const reader = response.body?.getReader();
  try {
    if (
      !reader ||
      response.status !== 200 ||
      response.headers.get("content-type")?.split(";")[0].trim() !== row.mime
    ) {
      throw new Error("Development Storage object missing or has the wrong content type.");
    }
    const hash = createHash("sha256");
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > row.bytes)
        throw new Error("Development Storage object exceeds its reviewed length.");
      hash.update(value);
    }
    if (received !== row.bytes || hash.digest("hex") !== row.sha256) {
      throw new Error("Development Storage byte verification failed.");
    }
  } finally {
    await reader?.cancel();
  }
}

// Produces one SQL unit. The release runner owns the transaction and connection.
export async function developmentCatalogSeed({ mode, fetchImpl = fetch }) {
  if (!["local", "development"].includes(mode))
    throw new Error("Specify local or development seed mode.");
  for (const asset of [image, video]) {
    const bytes = await readFile(new URL(`media/catalog-test-pattern.${asset.extension}`, directory));
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.hash) {
      throw new Error("Checked-in development media changed.");
    }
  }
  const media = catalogSeedMedia();
  if (mode === "development") {
    for (const row of media) await verifyStoredObject(row, fetchImpl);
  }
  const seed = await readFile(new URL("seed.sql", directory), "utf8");
  // Input contains only reviewed constants and digests built above.
  const inputs = JSON.stringify({ mode, media }).replaceAll("'", "''");
  return `SELECT pg_catalog.set_config('helix.catalog_seed_inputs', '${inputs}', true);\n${seed}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv[2];
  if (process.argv.length !== 3 || !["--local", "--development"].includes(flag)) {
    throw new Error("Use --local or --development. Run the output in one transaction.");
  }
  process.stdout.write(await developmentCatalogSeed({ mode: flag.slice(2) }));
}
