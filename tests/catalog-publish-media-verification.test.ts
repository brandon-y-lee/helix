import { afterEach, describe, expect, it, vi } from "vitest";
import { publishCatalogDraft } from "@/lib/admin/catalog/service";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import type {
  CatalogPublishDependencies,
} from "@/lib/admin/catalog/service";
import type { CatalogPublishTransactionSuccess } from "@/lib/admin/catalog/types";
import type { RealProductMediaVerificationReport } from "@/lib/catalog/real-product-media-verification";
import { catalogDraft } from "./fixtures/catalog-editor";

const MEDIA_ORIGIN = "https://erasogmsqpgiirovubjh.supabase.co";
const readyDocument = {
  ...catalogDraft.document,
  media: catalogDraft.document.media.map((media, index) => ({
    ...media,
    url: `${MEDIA_ORIGIN}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/media-${index}.webp`,
  })),
};

const failedReport: RealProductMediaVerificationReport = Object.freeze({
  results: Object.freeze([
    Object.freeze({
      url: readyDocument.media[0].url,
      expectedMediaType: "image" as const,
      outcome: "failed" as const,
      failure: Object.freeze({
        code: "network_error" as const,
        message: "The Product Media request failed before verification completed.",
      }),
      status: null,
      receivedBytes: 0,
      totalBytes: null,
      contentType: null,
      redirects: 0,
    }),
  ]),
  summary: Object.freeze({
    expectedRecords: 1,
    distinctUrls: 1,
    successes: 0,
    failures: 1,
    receivedBodyBytes: 0,
    bodyBudgetBytes: 32,
  }),
});

const healthyReport: RealProductMediaVerificationReport = Object.freeze({
  results: Object.freeze(
    readyDocument.media.map((media) =>
      Object.freeze({
        url: media.url,
        expectedMediaType: "image" as const,
        outcome: "succeeded" as const,
        failure: null,
        status: 206,
        receivedBytes: 32,
        totalBytes: 1_024,
        contentType: "image/webp",
        redirects: 0,
      }),
    ),
  ),
  summary: Object.freeze({
    expectedRecords: readyDocument.media.length,
    distinctUrls: readyDocument.media.length,
    successes: readyDocument.media.length,
    failures: 0,
    receivedBodyBytes: readyDocument.media.length * 32,
    bodyBudgetBytes: readyDocument.media.length * 32,
  }),
});

const publishSuccess: CatalogPublishTransactionSuccess = {
  ok: true,
  draft: {
    ...catalogDraft,
    status: "published",
    document: readyDocument,
  },
  revision: {
    id: "123e4567-e89b-42d3-a456-426614174099",
    product_id: catalogDraft.product_id,
    revision_number: 4,
    schema_version: 3,
    document: readyDocument,
    source_draft_id: catalogDraft.id,
    published_by: catalogDraft.updated_by,
    published_at: "2026-08-07T12:00:00.000Z",
  },
  changedTables: {
    products: false,
    productSlugRoutes: false,
    productPdpContent: false,
    variants: false,
    media: false,
    relationships: false,
    productSource: false,
  },
};

function dependencies(input: {
  verifyMedia: CatalogPublishDependencies["verifyMedia"];
  publishTransaction?: CatalogPublishDependencies["publishTransaction"];
  document?: typeof readyDocument;
}): CatalogPublishDependencies {
  const document = input.document ?? readyDocument;
  return {
    readDraft: vi.fn(async () => ({
      ...catalogDraft,
      status: "ready" as const,
      document,
    })),
    readCanonicalDocument: vi.fn(async () => document),
    pendingMediaValidationIssues: vi.fn(async () => []),
    relationshipValidationIssues: vi.fn(async () => []),
    verifyMedia: input.verifyMedia,
    publishTransaction:
      input.publishTransaction ??
      vi.fn<() => Promise<CatalogPublishTransactionSuccess>>(),
  };
}

describe("catalog publish media verification", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prevents the Publish transaction when candidate Product Media fails verification", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", MEDIA_ORIGIN);
    const publishTransaction = vi.fn<
      () => Promise<CatalogPublishTransactionSuccess>
    >();
    const deps = dependencies({
      verifyMedia: vi.fn(async () => failedReport),
      publishTransaction,
    });

    await expect(
      publishCatalogDraft(
        {
          draftId: catalogDraft.id,
          expectedVersion: catalogDraft.version,
          actorId: catalogDraft.updated_by,
          role: "catalog_publisher",
        },
        deps,
      ),
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
      details: {
        mediaVerification: failedReport,
      },
    });
    expect(publishTransaction).not.toHaveBeenCalled();
  });

  it("returns actionable issues for every media record sharing a failed URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", MEDIA_ORIGIN);
    const sharedUrl = readyDocument.media[0].url;
    const document = {
      ...readyDocument,
      media: readyDocument.media.map((media) => ({ ...media, url: sharedUrl })),
    };
    const report: RealProductMediaVerificationReport = {
      ...failedReport,
      results: [{
        ...failedReport.results[0],
        url: `${MEDIA_ORIGIN}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/sanitized.webp`,
      }],
      summary: {
        ...failedReport.summary,
        expectedRecords: 2,
      },
    };
    const publishTransaction = vi.fn<
      () => Promise<CatalogPublishTransactionSuccess>
    >();

    await expect(
      publishCatalogDraft(
        {
          draftId: catalogDraft.id,
          expectedVersion: catalogDraft.version,
          actorId: catalogDraft.updated_by,
          role: "catalog_publisher",
        },
        dependencies({
          document,
          verifyMedia: vi.fn(async () => report),
          publishTransaction,
        }),
      ),
    ).rejects.toMatchObject({
      details: {
        issues: [
          expect.objectContaining({ path: "media.0.url" }),
          expect.objectContaining({ path: "media.1.url" }),
        ],
      },
    });
    expect(publishTransaction).not.toHaveBeenCalled();
  });

  it("returns a committed Published Revision with healthy post-Publish media", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", MEDIA_ORIGIN);
    const publishTransaction = vi.fn(async () => publishSuccess);
    const verifyMedia = vi.fn(async () => healthyReport);
    const deps = dependencies({ verifyMedia, publishTransaction });

    const result = await publishCatalogDraft(
      {
        draftId: catalogDraft.id,
        expectedVersion: catalogDraft.version,
        actorId: catalogDraft.updated_by,
        role: "catalog_publisher",
      },
      deps,
    );

    expect(publishTransaction).toHaveBeenCalledOnce();
    expect(publishTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: catalogDraft.id,
        expectedVersion: catalogDraft.version,
        actorId: catalogDraft.updated_by,
        role: "catalog_publisher",
      }),
    );
    expect(verifyMedia).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ...publishSuccess,
      mediaVerification: {
        status: "healthy",
        report: healthyReport,
      },
    });
  });

  it("retains Publish success and returns a warning when post-Publish media fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", MEDIA_ORIGIN);
    const publishTransaction = vi.fn(async () => publishSuccess);
    const verifyMedia = vi
      .fn<CatalogPublishDependencies["verifyMedia"]>()
      .mockResolvedValueOnce(healthyReport)
      .mockResolvedValueOnce(failedReport);

    const result = await publishCatalogDraft(
      {
        draftId: catalogDraft.id,
        expectedVersion: catalogDraft.version,
        actorId: catalogDraft.updated_by,
        role: "catalog_publisher",
      },
      dependencies({ verifyMedia, publishTransaction }),
    );

    expect(publishTransaction).toHaveBeenCalledOnce();
    expect(verifyMedia).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.revision).toBe(publishSuccess.revision);
    expect(result.mediaVerification).toEqual({
      status: "warning",
      report: failedReport,
      message:
        "The revision was published, but its Product Media failed verification.",
    });
  });

  it("preserves the transaction authority for concurrent version conflicts", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", MEDIA_ORIGIN);
    const conflict = new CatalogAdminError(
      "version_conflict",
      "Another edit was saved before Publish.",
      409,
    );
    const publishTransaction = vi.fn(async () => {
      throw conflict;
    });

    await expect(
      publishCatalogDraft(
        {
          draftId: catalogDraft.id,
          expectedVersion: catalogDraft.version,
          actorId: catalogDraft.updated_by,
          role: "catalog_publisher",
        },
        dependencies({
          verifyMedia: vi.fn(async () => healthyReport),
          publishTransaction,
        }),
      ),
    ).rejects.toBe(conflict);
    expect(publishTransaction).toHaveBeenCalledOnce();
  });
});
