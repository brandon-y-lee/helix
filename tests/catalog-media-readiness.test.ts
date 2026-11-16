import { describe, expect, it } from "vitest";
import { validateCurrentProductMedia } from "@/lib/admin/catalog/media-readiness";
import { validateProductEditorDocument } from "@/lib/admin/catalog/validation";
import { catalogDocument } from "./fixtures/catalog-editor";

const ORIGIN = "https://erasogmsqpgiirovubjh.supabase.co";
const HASH = "a".repeat(64);
const PREFIX = `${ORIGIN}/storage/v1/object/public/helix-catalog/products/`;
const PRODUCT_ID = catalogDocument.productId;
const CURRENT_URL = `${PREFIX}${PRODUCT_ID}/primary/original/${HASH}.webp`;

function documentWithMedia(url: string | null) {
  const document = structuredClone(catalogDocument);
  document.media = [{ ...document.media[0], url }];
  return document;
}

describe("current Product Media readiness", () => {
  it("requires current Product identity for publishing while keeping historical drafts repairable", () => {
    const document = documentWithMedia(`${PREFIX}peptide-bounce/primary/original/${HASH}.webp`);

    expect(validateProductEditorDocument(document, {
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: ORIGIN,
    }).issues).toEqual([]);
    expect(validateCurrentProductMedia(document)).toEqual([
      expect.objectContaining({ path: "media.0.url", code: "retired_media_reference" }),
    ]);

    document.media[0].url = CURRENT_URL;
    document.product.slug = "super-serum";
    expect(validateCurrentProductMedia(document)).toEqual([]);
  });

  it("allows a null-URL Product Swatch but requires an address for a video", () => {
    const document = documentWithMedia(null);
    expect(validateCurrentProductMedia(document)).toEqual([]);

    document.media[0].media_type = "video";
    expect(validateCurrentProductMedia(document)).toEqual([
      expect.objectContaining({ path: "media.0.url", code: "retired_media_reference" }),
    ]);
  });

  it.each([
    "primary", "primary/original", "card-hover", "core-routine-editorial",
    "core-routine-texture", "gallery", "ingredients-texture", "outcomes",
    "profile", "application", "routine", "drafts",
  ])("accepts the preserved %s subpath without tying it to a Media Role", (subpath) => {
    expect(validateCurrentProductMedia(documentWithMedia(
      `${PREFIX}${PRODUCT_ID}/${subpath}/${HASH}.webp`,
    ))).toEqual([]);
  });

  it.each(["jpg", "png", "webp", "mp4"])("accepts immutable staged %s uploads", (extension) => {
    const document = documentWithMedia(`${PREFIX}${PRODUCT_ID}/drafts/${HASH}.${extension}`);
    document.media[0].media_type = extension === "mp4" ? "video" : "image";
    expect(validateCurrentProductMedia(document)).toEqual([]);
  });

  it.each([
    ["another Product", CURRENT_URL.replace(PRODUCT_ID, "123e4567-e89b-42d3-a456-426614174999")],
    ["retired slug", CURRENT_URL.replace(PRODUCT_ID, "maxxing-serum")],
    ["foreign origin", CURRENT_URL.replace(ORIGIN, "https://example.com")],
    ["lookalike origin", CURRENT_URL.replace(".supabase.co", ".supabase.co.example.com")],
    ["HTTP", CURRENT_URL.replace("https:", "http:")],
    ["credentials", CURRENT_URL.replace("https://", "https://user:secret@")],
    ["explicit port", CURRENT_URL.replace(ORIGIN, `${ORIGIN}:443`)],
    ["other bucket", CURRENT_URL.replace("helix-catalog/", "other/")],
    ["query", `${CURRENT_URL}?download=1`],
    ["empty query", `${CURRENT_URL}?`],
    ["fragment", `${CURRENT_URL}#image`],
    ["empty fragment", `${CURRENT_URL}#`],
    ["traversal", CURRENT_URL.replace("/primary/", "/unused/../primary/")],
    ["encoded traversal", CURRENT_URL.replace("/primary/", "/unused/%2e%2e/primary/")],
    ["encoded segment", CURRENT_URL.replace("/primary/", "/%70rimary/")],
    ["double slash", CURRENT_URL.replace("/primary/", "//primary/")],
    ["backslash", CURRENT_URL.replace("/primary/", "\\primary/")],
    ["trailing newline", `${CURRENT_URL}\n`],
    ["leading whitespace", ` ${CURRENT_URL}`],
    ["unsupported path", CURRENT_URL.replace("/primary/original/", "/unknown/")],
    ["unhashed filename", CURRENT_URL.replace(HASH, "approved")],
    ["uppercase hash", CURRENT_URL.replace(HASH, HASH.toUpperCase())],
    ["unsupported format", CURRENT_URL.replace(".webp", ".svg")],
    ["original delivery format", CURRENT_URL.replace(".webp", ".jpg")],
  ])("rejects %s without normalizing the supplied address", (_label, url) => {
    expect(validateCurrentProductMedia(documentWithMedia(url))).toEqual([
      expect.objectContaining({ path: "media.0.url", code: "retired_media_reference" }),
    ]);
  });

  it("requires a canonical UUID for the owning Product", () => {
    const document = documentWithMedia(CURRENT_URL);
    document.productId = "not-a-uuid";
    document.media[0].url = CURRENT_URL.replace(PRODUCT_ID, document.productId);
    expect(validateCurrentProductMedia(document)).toHaveLength(1);
  });
});
