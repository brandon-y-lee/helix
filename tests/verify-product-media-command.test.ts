import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  collectExpectedProductMedia,
  createBoundedProductMediaHttpClient,
  runActiveProductMediaVerification,
  runActiveProductMediaVerificationCli,
  type ProductMediaCatalogSnapshot,
  type ProductMediaVerifierRuntime,
} from "@/scripts/verify-product-media";

const approvedOrigin = "https://erasogmsqpgiirovubjh.supabase.co";
const imageUrl = `${approvedOrigin}/storage/v1/object/public/mei-pelle-catalog/card.png`;
const videoUrl = `${approvedOrigin}/storage/v1/object/public/mei-pelle-catalog/video.mp4`;

function httpSuccessResponse(mediaType: "image" | "video" = "image") {
  const bytes = mediaType === "image"
    ? Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      ])
    : Uint8Array.from([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
        0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
      ]);
  return new Response(bytes, {
    status: 206,
    headers: {
      "content-type": mediaType === "image" ? "image/png" : "video/mp4",
      "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
      "content-length": String(bytes.length),
      "cache-control": "max-age=60",
    },
  });
}

function createRuntimeForCatalog(
  catalog: ProductMediaCatalogSnapshot,
  fetchImpl: typeof fetch = async (input) =>
    httpSuccessResponse(String(input) === videoUrl ? "video" : "image"),
): ProductMediaVerifierRuntime {
  const fetchMock = vi.fn(fetchImpl);
  return {
    pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
    maxRedirects: 3,
    timeoutMs: 1_000,
    approvedMediaOrigin: approvedOrigin,
    createHttpClient: () => createBoundedProductMediaHttpClient(fetchMock as typeof fetch),
    loadCatalog: async () => catalog,
  };
}

describe("Product Media Verification Command", () => {
  it("projects dynamic Active Product Media inventory into bounded verification", async () => {
    const runtime = createRuntimeForCatalog({
      products: [
        {
          id: "p-1",
          slug: "alpha",
          product_media: [
            { media_type: "image", url: imageUrl },
            { media_type: "video", url: videoUrl },
          ],
        },
        {
          id: "p-2",
          slug: "beta",
          product_media: [],
        },
      ],
    });

    const report = await runActiveProductMediaVerification(runtime);

    expect(report.ok).toBe(true);
    expect(report.catalog.activeProducts).toBe(2);
    expect(report.catalog.expectedRecords).toBe(2);
    expect(report.catalog.distinctUrls).toBe(2);
    expect(report.verification.expectedRecords).toBe(2);
    expect(report.verification.distinctUrls).toBe(2);
    expect(report.verification.failures).toBe(0);
  });

  it("keeps a distinct URL budget by deduplicating repeated public Product Media", async () => {
    const report = await runActiveProductMediaVerification(
      createRuntimeForCatalog({
        products: [
          { id: "p-1", slug: "alpha", product_media: [{ media_type: "image", url: imageUrl }] },
          { id: "p-2", slug: "beta", product_media: [{ media_type: "image", url: imageUrl }] },
        ],
      }),
    );

    expect(report.catalog.expectedRecords).toBe(2);
    expect(report.catalog.distinctUrls).toBe(1);
    expect(report.verification.expectedRecords).toBe(2);
    expect(report.verification.distinctUrls).toBe(1);
    expect(report.verification.bodyBudgetBytes).toBe(32);
  });

  it("returns false and errors when catalog inventory cannot be loaded", async () => {
    const runtime: ProductMediaVerifierRuntime = {
      loadCatalog: async () => {
        throw new Error("Catalog read unavailable");
      },
      approvedMediaOrigin: approvedOrigin,
      createHttpClient: () => createBoundedProductMediaHttpClient(async () => httpSuccessResponse()),
      pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
      maxRedirects: 3,
      timeoutMs: 1_000,
    };

    const report = await runActiveProductMediaVerification(runtime);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(["Active Product Catalog read failed."]);
    expect(report.failures).toEqual([]);
    expect(report.verification.expectedRecords).toBe(0);
    expect(report.verification.distinctUrls).toBe(0);
  });

  it("rejects a split response that continues after the 32-byte budget", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
          0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
          0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        ]));
        controller.enqueue(Uint8Array.of(0xff));
      },
    });
    const report = await runActiveProductMediaVerification(
      createRuntimeForCatalog(
        {
          products: [
            {
              id: "p-1",
              slug: "alpha",
              product_media: [{ media_type: "image", url: imageUrl }],
            },
          ],
        },
        async () =>
          new Response(stream, {
            status: 206,
            headers: {
              "content-type": "image/png",
              "content-range": "bytes 0-31/64",
              "content-length": "32",
              "cache-control": "public, max-age=60",
            },
          }),
      ),
    );

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "excessive_response", receivedBytes: 32 }),
    ]);
  });

  it("reports each failed URL and returns a failed aggregate for partial media failure", async () => {
    const report = await runActiveProductMediaVerification(
      createRuntimeForCatalog(
        {
          products: [
            {
              id: "p-1",
              slug: "alpha",
              product_media: [
                { media_type: "image", url: imageUrl },
                { media_type: "video", url: videoUrl },
              ],
            },
          ],
        },
        async (input) =>
          String(input) === videoUrl
            ? new Response(new Uint8Array(64), { status: 200 })
            : httpSuccessResponse(),
      ),
    );

    expect(report.ok).toBe(false);
    expect(report.verification.successes).toBe(1);
    expect(report.verification.failures).toBe(1);
    expect(report.failures).toEqual([
      expect.objectContaining({
        url: videoUrl,
        expectedMediaType: "video",
        code: "range_not_honored",
        status: 200,
      }),
    ]);
  });

  it("emits actionable JSON output for CLI failures with nonzero status", async () => {
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runActiveProductMediaVerificationCli(process.env, {
      mode: "json-only",
      runtime: {
        loadCatalog: async () => {
          throw new Error("Catalog read unavailable");
        },
        approvedMediaOrigin: approvedOrigin,
        createHttpClient: () => createBoundedProductMediaHttpClient(async () => httpSuccessResponse()),
        pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
        maxRedirects: 3,
        timeoutMs: 1_000,
      },
      logger: {
        output: (line) => output.push(line),
        error: (line) => errors.push(line),
      },
    });

    const report = JSON.parse(output[0] ?? "{}");
    expect(exitCode).toBe(1);
    expect(errors).toEqual([]);
    expect(report.ok).toBe(false);
    expect(Array.isArray(report.failures)).toBe(true);
    expect(report.errors).toEqual(["Active Product Catalog read failed."]);
  });

  it("emits a human summary and machine report with a zero status on success", async () => {
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runActiveProductMediaVerificationCli(process.env, {
      runtime: createRuntimeForCatalog({
        products: [
          {
            id: "p-1",
            slug: "alpha",
            product_media: [{ media_type: "image", url: imageUrl }],
          },
        ],
      }),
      logger: {
        output: (line) => output.push(line),
        error: (line) => errors.push(line),
      },
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(output).toContain("Active Product Media verification PASS");
    expect(output).toContain(
      "Verification: expectedRecords=1, distinctUrls=1, successes=1, failures=0, receivedBodyBytes=32/32",
    );
    expect(JSON.parse(output.at(-1) ?? "{}")).toMatchObject({
      ok: true,
      verification: { distinctUrls: 1, receivedBodyBytes: 32, bodyBudgetBytes: 32 },
    });
  });

  it("collects exact image/video media records from the Active Product inventory", () => {
    const snapshot: ProductMediaCatalogSnapshot = {
      products: [
        {
          id: "p-1",
          slug: "alpha",
          product_media: [
            { media_type: "image", url: imageUrl },
            { media_type: "video", url: videoUrl },
          ],
        },
      ],
    };

    expect(collectExpectedProductMedia(snapshot)).toEqual([
      {
        mediaType: "image",
        url: imageUrl,
      },
      {
        mediaType: "video",
        url: videoUrl,
      },
    ]);
  });

  it("fails closed when Product Media type or URL metadata is unsupported", () => {
    expect(() =>
      collectExpectedProductMedia({
        products: [
          {
            id: "p-1",
            slug: "alpha",
            product_media: [{ media_type: "video", url: 123 }],
          },
        ],
      }),
    ).toThrow(/missing or invalid public URL/);

    expect(() =>
      collectExpectedProductMedia({
        products: [
          {
            id: "p-1",
            slug: "alpha",
            product_media: [{ media_type: "placeholder", url: null }],
          },
        ],
      }),
    ).toThrow(/unsupported media type/);
  });

  it("preserves known catalog counts when inventory validation fails", async () => {
    const report = await runActiveProductMediaVerification(
      createRuntimeForCatalog({
        products: [
          {
            id: "p-1",
            slug: "alpha",
            product_media: [{ media_type: "placeholder", url: null }],
          },
        ],
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.catalog).toEqual({
      activeProducts: 1,
      expectedRecords: 1,
      distinctUrls: 0,
    });
    expect(report.errors).toEqual([
      "Active Product Media inventory contains an unsupported media type.",
    ]);
  });

  it("runs daily and manually outside required pull-request gates", async () => {
    const [workflow, ciWorkflow, packageJsonSource] = await Promise.all([
      readFile(
        resolve(process.cwd(), ".github/workflows/active-product-media-verification.yml"),
        "utf8",
      ),
      readFile(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8"),
      readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ]);
    const packageJson = JSON.parse(packageJsonSource) as {
      scripts: Record<string, string>;
    };

    expect(workflow).toContain('cron: "0 0 * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("pnpm verify:product-media -- --json");
    expect(workflow).toContain("$GITHUB_STEP_SUMMARY");
    expect(workflow).not.toContain("verify:production");
    expect(workflow).not.toContain("playwright");
    expect(workflow).not.toContain("next build");
    expect(ciWorkflow).not.toContain("verify:product-media");
    expect(packageJson.scripts["verify:product-media"]).toBe(
      "tsx scripts/verify-product-media.ts",
    );
  });
});
