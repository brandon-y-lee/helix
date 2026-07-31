import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  applyCatalogWebhookEvent,
  verifyWebhookSecret,
} from "@/lib/algolia/sync";
import { POST } from "@/app/api/webhooks/supabase/catalog-search-sync/route";

vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return {
    ...actual,
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
  };
});

vi.mock("@/lib/algolia/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/algolia/sync")>();
  return {
    ...actual,
    applyCatalogWebhookEvent: vi.fn(),
    verifyWebhookSecret: vi.fn(),
  };
});

const applyMock = vi.mocked(applyCatalogWebhookEvent);
const verifyMock = vi.mocked(verifyWebhookSecret);
const revalidatePathMock = vi.mocked(revalidatePath);
const revalidateTagMock = vi.mocked(revalidateTag);

function request(body: unknown, init: RequestInit = {}) {
  return new Request("https://mei-pelle.test/api/webhooks/supabase/catalog-search-sync", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": "valid-secret",
      ...(init.headers ?? {}),
    },
  });
}

beforeEach(() => {
  applyMock.mockReset();
  verifyMock.mockReset();
  revalidatePathMock.mockReset();
  revalidateTagMock.mockReset();
  verifyMock.mockImplementation((secret) => secret === "valid-secret");
});

describe("catalog search sync route", () => {
  it("rejects missing or invalid webhook secrets before parsing work", async () => {
    const response = await POST(
      request({ type: "UPDATE", table: "product_media" }, {
        headers: { "x-webhook-secret": "wrong" },
      }),
    );

    expect(response.status).toBe(401);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported catalog webhook payloads", async () => {
    const response = await POST(
      request({
        schema: "public",
        type: "INSERT",
        table: "orders",
        record: { id: "order-1" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/unsupported table/);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("rebuilds media updates and invalidates affected catalog targets", async () => {
    applyMock.mockResolvedValue({
      action: "upsert",
      table: "product_media",
      objectID: "f6091deb-1177-45ad-b506-1f0427fa4abe",
      slug: "treat-03-pdrn-5-ampoule",
      routineGroup: "core",
    });

    const response = await POST(
      request({
        schema: "public",
        type: "UPDATE",
        table: "product_media",
        record: {
          id: "media-2",
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          role: "card_default",
        },
        old_record: {
          id: "media-1",
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          role: "card_default",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(applyMock).toHaveBeenCalledOnce();
    expect(revalidateTagMock).toHaveBeenCalledWith("catalog-product-card");
    expect(revalidateTagMock).toHaveBeenCalledWith(
      "catalog-product-card:treat-03-pdrn-5-ampoule",
    );
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "catalog-product-content:treat-03-pdrn-5-ampoule",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/products");
    expect(revalidatePathMock).toHaveBeenCalledWith("/products/treat-03-pdrn-5-ampoule");
  });

  it("attempts cache invalidation and returns retryable failure when Algolia sync fails", async () => {
    applyMock.mockRejectedValue(new Error("Algolia unavailable"));

    const response = await POST(
      request({
        schema: "public",
        type: "UPDATE",
        table: "products",
        record: {
          id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          slug: "treat-03-pdrn-5-ampoule",
          routine_group: "core",
        },
        old_record: {
          id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          slug: "treat-03-pdrn-5-ampoule",
          routine_group: "core",
        },
      }),
    );

    expect(response.status).toBe(502);
    expect(revalidateTagMock).toHaveBeenCalledWith(
      "catalog-product-content:treat-03-pdrn-5-ampoule",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/products/treat-03-pdrn-5-ampoule");
  });

  it("invalidates only the PDP for editorial media roles", async () => {
    applyMock.mockResolvedValue({
      action: "noop",
      table: "product_media",
      objectID: "f6091deb-1177-45ad-b506-1f0427fa4abe",
      slug: "treat-03-pdrn-5-ampoule",
      routineGroup: "core",
      reason: "PDP-only media role is not indexed",
    });

    const response = await POST(
      request({
        schema: "public",
        type: "INSERT",
        table: "product_media",
        record: {
          id: "media-editorial",
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          role: "pdp_application",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith(
      "catalog-product-content:treat-03-pdrn-5-ampoule",
    );
    expect(revalidateTagMock).toHaveBeenCalledWith("catalog-product-content");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/products/treat-03-pdrn-5-ampoule",
    );
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "catalog-product-card:treat-03-pdrn-5-ampoule",
    );
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "catalog-product-offer:treat-03-pdrn-5-ampoule",
    );
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/products");
  });

  it.each(["core_routine_texture", "core_routine_editorial"])(
    "invalidates the routine tag and every Core PDP for shared role %s",
    async (role) => {
    applyMock.mockResolvedValue({
      action: "noop",
      table: "product_media",
      objectID: "f6091deb-1177-45ad-b506-1f0427fa4abe",
      slug: "treat-03-pdrn-5-ampoule",
      routineGroup: "core",
      reason: "PDP-only media role is not indexed",
    });

    const response = await POST(
      request({
        schema: "public",
        type: "INSERT",
        table: "product_media",
        record: {
          id: "media-core-routine",
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          role,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith("catalog-core-routine");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/products/cleanse-01-calming-gel-cleanser",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/products/treat-03-pdrn-5-ampoule",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/products/seal-05-green-collagen-cream",
    );
    expect(revalidateTagMock).not.toHaveBeenCalledWith("catalog-product-card");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/products");
    },
  );

  it("invalidates offer state without invalidating editorial content", async () => {
    applyMock.mockResolvedValue({
      action: "upsert",
      table: "product_variants",
      objectID: "f6091deb-1177-45ad-b506-1f0427fa4abe",
      slug: "treat-03-pdrn-5-ampoule",
      routineGroup: "core",
    });

    const response = await POST(
      request({
        schema: "public",
        type: "UPDATE",
        table: "product_variants",
        record: {
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          price_cents: 2600,
          available: true,
        },
        old_record: {
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          price_cents: 2500,
          available: true,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith(
      "catalog-product-offer:treat-03-pdrn-5-ampoule",
    );
    expect(revalidateTagMock).toHaveBeenCalledWith("catalog-product-offer");
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "catalog-product-content:treat-03-pdrn-5-ampoule",
    );
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "catalog-product-card:treat-03-pdrn-5-ampoule",
    );
  });

  it("keeps PDP content updates on the shared webhook without indexing them", async () => {
    applyMock.mockResolvedValue({
      action: "noop",
      table: "product_pdp_content",
      objectID: "f6091deb-1177-45ad-b506-1f0427fa4abe",
      slug: "treat-03-pdrn-5-ampoule",
      routineGroup: "core",
      reason: "PDP content is not indexed",
    });

    const response = await POST(
      request({
        schema: "public",
        type: "UPDATE",
        table: "product_pdp_content",
        record: {
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          schema_version: 1,
        },
        old_record: {
          product_id: "f6091deb-1177-45ad-b506-1f0427fa4abe",
          schema_version: 1,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith(
      "catalog-product-content:treat-03-pdrn-5-ampoule",
    );
    expect(revalidateTagMock).toHaveBeenCalledWith("catalog-core-routine");
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "catalog-product-offer:treat-03-pdrn-5-ampoule",
    );
  });
});
