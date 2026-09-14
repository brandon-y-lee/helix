// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stageCatalogMedia } from "@/lib/admin/catalog/media";
import { validateProductEditorDocument } from "@/lib/admin/catalog/validation";
import { catalogDocument } from "./fixtures/catalog-editor";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

const PRODUCT_ID = "123e4567-e89b-42d3-a456-426614174000";
const VARIANT_ID = "123e4567-e89b-42d3-a456-426614174001";
const ACTOR_ID = "123e4567-e89b-42d3-a456-426614174005";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2V8AAAAASUVORK5CYII=",
  "base64",
);
const HASH = "b00849688e85d6c3481246222778c4f7449cb097ec1d0f88d3c499e025c70f14";
const ORIGIN = "https://erasogmsqpgiirovubjh.supabase.co";

function storageBoundary(options: { auditFails?: boolean } = {}) {
  const uploaded = new Map<string, Buffer>();
  const product = {
    id: PRODUCT_ID,
    slug: "super-serum",
    routine_group: "core",
    catalog_status: "active",
    published_at: "2026-07-20T12:00:00.000Z" as string | null,
  };
  const boundary = {
    from(table: string) {
      if (table === "catalog_editor_audit_log") {
        return { insert: async () => ({ error: options.auditFails ? { message: "Unavailable" } : null }) };
      }
      const row: Record<string, unknown> = table === "products"
        ? product
        : { id: VARIANT_ID, product_id: PRODUCT_ID, archived_at: null };
      const filters = new Map<string, unknown>();
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => {
          filters.set(field, value);
          return query;
        },
        is: (field: string, value: unknown) => {
          filters.set(field, value);
          return query;
        },
        maybeSingle: async () => ({
          data: [...filters].every(([field, value]) => row[field] === value) ? row : null,
          error: null,
        }),
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            bytes: Buffer,
            options: { upsert: boolean; cacheControl: string; contentType: string },
          ) => {
            expect(bucket).toBe("helix-catalog");
            expect(options).toEqual({
              upsert: false,
              cacheControl: "31536000",
              contentType: "image/png",
            });
            if (uploaded.has(path)) return { error: { message: "Already exists" } };
            uploaded.set(path, bytes);
            return { error: null };
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `${ORIGIN}/storage/v1/object/public/${bucket}/${path}` },
          }),
        };
      },
    },
  };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(
    boundary as unknown as ReturnType<typeof createSupabaseAdminClient>,
  );
  return { product, uploaded };
}

function uploadInput() {
  return {
    file: new File([PNG], "approved.png", { type: "image/png" }),
    productId: PRODUCT_ID,
    actorId: ACTOR_ID,
    role: "gallery",
    sortOrder: 0,
    alt: " Approved Product image ",
    variantId: null,
  };
}

describe("staging Product Media", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps immutable uploads under the verified Product ID across a rename", async () => {
    const { product, uploaded } = storageBoundary();
    const first = await stageCatalogMedia(uploadInput());
    product.slug = "new-display-name";
    const second = await stageCatalogMedia(uploadInput());
    const path = `products/${PRODUCT_ID}/drafts/${HASH}.png`;

    expect(first).toMatchObject({
      url: `${ORIGIN}/storage/v1/object/public/helix-catalog/${path}`,
      width: 1,
      height: 1,
      alt: "Approved Product image",
      pendingUpload: { path, sha256: HASH, uploadedBy: ACTOR_ID },
    });
    expect(second.url).toBe(first.url);
    expect(uploaded).toEqual(new Map([[path, PNG]]));
  });

  it("stages first media for a Draft Product before its first publication", async () => {
    const { product } = storageBoundary();
    product.catalog_status = "draft";
    product.published_at = null;
    const media = await stageCatalogMedia(uploadInput());

    expect(media.pendingUpload?.path).toBe(`products/${PRODUCT_ID}/drafts/${HASH}.png`);
  });

  it("requires staged evidence to describe the exact address in the Product draft", async () => {
    storageBoundary();
    const media = await stageCatalogMedia(uploadInput());
    const document = structuredClone(catalogDocument);
    document.media = [{ ...document.media[0], ...media }];
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: ORIGIN };
    expect(validateProductEditorDocument(document, env).issues).toEqual([]);

    document.media[0].url = media.url!.replace(HASH, "a".repeat(64));
    expect(validateProductEditorDocument(document, env).issues).toEqual([
      expect.objectContaining({ path: "media.0.pendingUpload", code: "invalid_upload" }),
    ]);
  });

  it.each([
    ["missing Product", { productId: "123e4567-e89b-42d3-a456-426614174999" }, "product_not_found"],
    ["foreign Variant", { variantId: "123e4567-e89b-42d3-a456-426614174999" }, "invalid_media_variant"],
    ["invalid role", { role: "unreviewed" }, "invalid_media_role"],
    ["invalid order", { sortOrder: -1 }, "invalid_media_order"],
    ["missing alt", { alt: " " }, "invalid_media_alt"],
  ])("rejects %s before writing media", async (_label, overrides, code) => {
    const { uploaded } = storageBoundary();
    await expect(stageCatalogMedia({ ...uploadInput(), ...overrides })).rejects.toMatchObject({ code });
    expect(uploaded.size).toBe(0);
  });

  it("rejects bytes that do not match their declared file type", async () => {
    const { uploaded } = storageBoundary();
    await expect(stageCatalogMedia({
      ...uploadInput(),
      file: new File([PNG], "mislabeled.webp", { type: "image/webp" }),
    })).rejects.toMatchObject({ code: "invalid_media_format" });
    expect(uploaded.size).toBe(0);
  });

  it("does not return usable staged metadata when the upload cannot be audited", async () => {
    storageBoundary({ auditFails: true });
    await expect(stageCatalogMedia(uploadInput())).rejects.toMatchObject({ code: "media_audit_failed" });
  });
});
