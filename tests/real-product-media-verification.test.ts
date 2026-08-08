import { describe, expect, it, vi } from "vitest";
import {
  verifyRealProductMedia,
  type ProductMediaHttpClient,
  type ProductMediaHttpResponse,
} from "@/lib/catalog/real-product-media-verification";

const mediaOrigin = "https://erasogmsqpgiirovubjh.supabase.co";
const imageUrl = `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalog/card.png`;

function body(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("Real Product Media verification", () => {
  it("verifies one exact public URL with a credential-free bounded request", async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 206,
      headers: {
        "cache-control": "public, max-age=3600",
        "content-length": String(png.byteLength),
        "content-range": `bytes 0-${png.byteLength - 1}/${png.byteLength}`,
        "content-type": "image/png",
      },
      body: body(png),
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 2,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: "omit",
        headers: { Range: "bytes=0-31" },
        method: "GET",
        redirect: "manual",
        url: imageUrl,
      }),
    );
    expect(report).toEqual({
      results: [
        {
          url: imageUrl,
          expectedMediaType: "image",
          outcome: "succeeded",
          failure: null,
          status: 206,
          receivedBytes: png.byteLength,
          totalBytes: png.byteLength,
          contentType: "image/png",
          redirects: 0,
        },
      ],
      summary: {
        expectedRecords: 1,
        distinctUrls: 1,
        successes: 1,
        failures: 0,
        receivedBodyBytes: png.byteLength,
        bodyBudgetBytes: 32,
      },
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.results)).toBe(true);
    expect(Object.isFrozen(report.results[0])).toBe(true);
    expect(Object.isFrozen(report.summary)).toBe(true);
  });

  it("fails a duplicate exact URL with conflicting Catalog media types without requesting it", async () => {
    const request = vi.fn<ProductMediaHttpClient["request"]>();

    const report = await verifyRealProductMedia({
      expectedMedia: [
        { url: imageUrl, mediaType: "image" },
        { url: imageUrl, mediaType: "video" },
      ],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 2,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).not.toHaveBeenCalled();
    expect(report.results).toEqual([
      expect.objectContaining({
        url: imageUrl,
        outcome: "failed",
        failure: {
          code: "conflicting_expectations",
          message: "Conflicting Catalog media types were provided for this URL.",
        },
        receivedBytes: 0,
      }),
    ]);
    expect(report.summary).toEqual({
      expectedRecords: 2,
      distinctUrls: 1,
      successes: 0,
      failures: 1,
      receivedBodyBytes: 0,
      bodyBudgetBytes: 32,
    });
  });

  it("rejects an initial URL containing credentials before making a request", async () => {
    const credentialedUrl =
      "https://customer:secret@erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/card.png";
    const request = vi.fn<ProductMediaHttpClient["request"]>();

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: credentialedUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 2,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).not.toHaveBeenCalled();
    expect(report.results[0]).toEqual(
      expect.objectContaining({
        url: imageUrl,
        outcome: "failed",
        failure: {
          code: "initial_url_rejected",
          message:
            "The initial URL is not an approved public Customer Product Media URL.",
        },
      }),
    );
    expect(JSON.stringify(report)).not.toContain("customer");
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it("follows a bounded redirect only when the destination remains approved", async () => {
    const redirectedUrl = `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalog/final.png`;
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi
      .fn<ProductMediaHttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: redirectedUrl },
        body: null,
      })
      .mockResolvedValueOnce({
        status: 206,
        headers: {
          "cache-control": "max-age=60",
          "content-range": `bytes 0-${png.byteLength - 1}/${png.byteLength}`,
          "content-type": "image/png",
        },
        body: body(png),
      });

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 1,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([value]) => value.url)).toEqual([
      imageUrl,
      redirectedUrl,
    ]);
    expect(request.mock.calls.every(([value]) =>
      value.credentials === "omit" && value.headers.Range === "bytes=0-31"
    )).toBe(true);
    expect(report.results[0]).toEqual(
      expect.objectContaining({ outcome: "succeeded", redirects: 1 }),
    );
  });

  it("aborts an ignored Range response before reading its body", async () => {
    const cancel = vi.fn();
    const unboundedBody = new ReadableStream<Uint8Array>({
      cancel,
    });
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 200,
      headers: {
        "content-length": "1048576",
        "content-type": "image/png",
      },
      body: unboundedBody,
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(cancel).toHaveBeenCalledOnce();
    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "range_not_honored",
          message: "The response did not honor the requested byte range.",
        },
        status: 200,
        receivedBytes: 0,
      }),
    );
    expect(report.summary.receivedBodyBytes).toBe(0);
  });

  it("rejects an excessive declared body before consuming it", async () => {
    const cancel = vi.fn();
    const responseBody = new ReadableStream<Uint8Array>({ cancel });
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 206,
      headers: {
        "cache-control": "max-age=60",
        "content-length": "64",
        "content-range": "bytes 0-31/100",
        "content-type": "image/png",
      },
      body: responseBody,
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(cancel).toHaveBeenCalledOnce();
    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "excessive_response",
          message: "The response body exceeded the requested byte range.",
        },
        receivedBytes: 0,
        totalBytes: 100,
      }),
    );
  });

  it("caps streamed bytes at the per-URL budget and aborts an excessive body", async () => {
    const cancel = vi.fn();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64));
      },
      cancel,
    });
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 206,
      headers: {
        "cache-control": "max-age=60",
        "content-range": "bytes 0-31/100",
        "content-type": "image/png",
      },
      body: responseBody,
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(cancel).toHaveBeenCalledOnce();
    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "excessive_response",
          message: "The response body exceeded the requested byte range.",
        },
        receivedBytes: 32,
      }),
    );
    expect(report.summary.receivedBodyBytes).toBe(32);
    expect(report.summary.receivedBodyBytes).toBeLessThanOrEqual(
      report.summary.bodyBudgetBytes,
    );
  }, 500);

  it("fails when the Catalog media type, declared content type, and signature disagree", async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 206,
      headers: {
        "cache-control": "max-age=60",
        "content-range": `bytes 0-${png.byteLength - 1}/${png.byteLength}`,
        "content-type": "image/png",
      },
      body: body(png),
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "video" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "media_mismatch",
          message:
            "The Catalog media type, declared content type, and leading-byte signature did not agree.",
        },
        contentType: "image/png",
        receivedBytes: png.byteLength,
      }),
    );
  });

  it("fails a response without a positive public cache lifetime", async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 206,
      headers: {
        "cache-control": "private, no-store, max-age=60",
        "content-range": `bytes 0-${png.byteLength - 1}/${png.byteLength}`,
        "content-type": "image/png",
      },
      body: body(png),
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "unsafe_cache_policy",
          message:
            "The response did not advertise a positive public max-age without private or no-store.",
        },
      }),
    );
  });

  it("reports a network error without leaking it and still completes other URLs", async () => {
    const secondUrl = `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalog/second.png`;
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi
      .fn<ProductMediaHttpClient["request"]>()
      .mockRejectedValueOnce(new Error("raw provider payload with secret-value"))
      .mockResolvedValueOnce({
        status: 206,
        headers: {
          "cache-control": "max-age=60",
          "content-range": `bytes 0-${png.byteLength - 1}/${png.byteLength}`,
          "content-type": "image/png",
        },
        body: body(png),
      });

    const report = await verifyRealProductMedia({
      expectedMedia: [
        { url: imageUrl, mediaType: "image" },
        { url: secondUrl, mediaType: "image" },
      ],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "network_error",
          message: "The Product Media request failed before verification completed.",
        },
      }),
    );
    expect(report.results[1]).toEqual(
      expect.objectContaining({ outcome: "succeeded" }),
    );
    expect(report.summary).toEqual(
      expect.objectContaining({ successes: 1, failures: 1 }),
    );
    expect(JSON.stringify(report)).not.toContain("secret-value");
    expect(JSON.stringify(report)).not.toContain("provider payload");
  });

  it("reports an aborted request explicitly", async () => {
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => {
      throw new DOMException("aborted by transport", "AbortError");
    });

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "request_aborted",
          message: "The Product Media request was aborted before completion.",
        },
      }),
    );
  });

  it("times out even when the HTTP client does not respond to abort", async () => {
    const request = vi.fn<ProductMediaHttpClient["request"]>(
      async () => new Promise<ProductMediaHttpResponse>(() => {}),
    );

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 10,
      },
      httpClient: { request },
    });

    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "request_timeout",
          message: "The Product Media request exceeded its time limit.",
        },
      }),
    );
  }, 500);

  it("does not treat a longer sibling path as an approved path prefix", async () => {
    const siblingUrl = `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalogue/card.png`;
    const request = vi.fn<ProductMediaHttpClient["request"]>();

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: siblingUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).not.toHaveBeenCalled();
    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: expect.objectContaining({ code: "initial_url_rejected" }),
      }),
    );
  });

  it("fails when Content-Length disagrees with the honored range", async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 206,
      headers: {
        "cache-control": "max-age=60",
        "content-length": "7",
        "content-range": "bytes 0-7/8",
        "content-type": "image/png",
      },
      body: body(png),
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "malformed_range",
          message: "The response contained an invalid byte range.",
        },
        receivedBytes: 0,
        totalBytes: 8,
      }),
    );
  });

  it("accepts WebP and MP4 signatures while deduplicating exact URLs and budgets dynamically", async () => {
    const webpUrl = `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalog/card.webp?v=1`;
    const videoUrl = `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalog/routine.mp4`;
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ]);
    const mp4 = Uint8Array.from([
      0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
    ]);
    const request = vi
      .fn<ProductMediaHttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 206,
        headers: {
          "cache-control": "public, max-age=86400",
          "content-range": `bytes 0-${webp.byteLength - 1}/${webp.byteLength}`,
          "content-type": "image/webp",
        },
        body: body(webp),
      })
      .mockResolvedValueOnce({
        status: 206,
        headers: {
          "cache-control": "max-age=86400",
          "content-range": `bytes 0-${mp4.byteLength - 1}/${mp4.byteLength}`,
          "content-type": "video/mp4",
        },
        body: body(mp4),
      });

    const report = await verifyRealProductMedia({
      expectedMedia: [
        { url: webpUrl, mediaType: "image" },
        { url: webpUrl, mediaType: "image" },
        { url: videoUrl, mediaType: "video" },
      ],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([value]) => value.url)).toEqual([
      webpUrl,
      videoUrl,
    ]);
    expect(report.results.map((result) => result.contentType)).toEqual([
      "image/webp",
      "video/mp4",
    ]);
    expect(report.summary).toEqual({
      expectedRecords: 3,
      distinctUrls: 2,
      successes: 2,
      failures: 0,
      receivedBodyBytes: 24,
      bodyBudgetBytes: 64,
    });
  });

  it("fails closed for unsafe protocols, private paths, signed substitutions, path escapes, and invalid URLs", async () => {
    const unsafeUrls = [
      imageUrl.replace("https:", "http:"),
      `${mediaOrigin}/storage/v1/object/sign/mei-pelle-catalog/card.png`,
      `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalog/%2e%2e/private/card.png`,
      `${imageUrl}?token=secret-token`,
      "not-a-url-with-secret-token",
    ];
    const request = vi.fn<ProductMediaHttpClient["request"]>();

    const report = await verifyRealProductMedia({
      expectedMedia: unsafeUrls.map((url) => ({
        url,
        mediaType: "image" as const,
      })),
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).not.toHaveBeenCalled();
    expect(report.results).toHaveLength(unsafeUrls.length);
    expect(report.results.every((result) =>
      result.outcome === "failed" &&
      result.failure?.code === "initial_url_rejected"
    )).toBe(true);
    expect(report.summary).toEqual(
      expect.objectContaining({ successes: 0, failures: unsafeUrls.length }),
    );
    expect(JSON.stringify(report)).not.toContain("secret-token");
  });

  it("redacts signed credentials even when duplicate expectations conflict", async () => {
    const signedUrl = `${imageUrl}?token=confidential-signature`;
    const request = vi.fn<ProductMediaHttpClient["request"]>();

    const report = await verifyRealProductMedia({
      expectedMedia: [
        { url: signedUrl, mediaType: "image" },
        { url: signedUrl, mediaType: "video" },
      ],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).not.toHaveBeenCalled();
    expect(report.results[0]?.failure?.code).toBe("conflicting_expectations");
    expect(JSON.stringify(report)).not.toContain("confidential-signature");
  });

  it("rejects a known authenticated Storage endpoint even if a caller approves its prefix", async () => {
    const authenticatedUrl = `${mediaOrigin}/storage/v1/object/authenticated/mei-pelle-catalog/card.png`;
    const request = vi.fn<ProductMediaHttpClient["request"]>();

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: authenticatedUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/authenticated/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).not.toHaveBeenCalled();
    expect(report.results[0]?.failure?.code).toBe("initial_url_rejected");
  });

  it("rejects an off-policy redirect without following it", async () => {
    const cancel = vi.fn();
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 302,
      headers: { location: "https://example.com/unapproved/card.png" },
      body: new ReadableStream({ cancel }),
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 2,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(report.results[0]).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          code: "redirect_rejected",
          message:
            "The redirect left the approved public Customer Product Media policy.",
        },
      }),
    );
  });

  it("stops before following a redirect beyond the configured limit", async () => {
    const redirectedUrl = `${mediaOrigin}/storage/v1/object/public/mei-pelle-catalog/final.png`;
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 307,
      headers: { location: redirectedUrl },
      body: null,
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).toHaveBeenCalledOnce();
    expect(report.results[0]?.failure?.code).toBe(
      "redirect_limit_exceeded",
    );
  });

  it("rejects a redirect path escape before URL normalization can hide it", async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi
      .fn<ProductMediaHttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: "./nested/%2e%2e/card.png" },
        body: null,
      })
      .mockResolvedValueOnce({
        status: 206,
        headers: {
          "cache-control": "max-age=60",
          "content-range": "bytes 0-7/8",
          "content-type": "image/png",
        },
        body: body(png),
      });

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: imageUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          {
            origin: mediaOrigin,
            pathPrefix: "/storage/v1/object/public/mei-pelle-catalog/",
          },
        ],
        maxRedirects: 1,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).toHaveBeenCalledOnce();
    expect(report.results[0]?.failure?.code).toBe("redirect_rejected");
  });

  it("does not mistake an ordinary public hostname for an IPv6 private range", async () => {
    const publicOrigin = "https://fc-media.example";
    const publicUrl = `${publicOrigin}/products/card.png`;
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const request = vi.fn<ProductMediaHttpClient["request"]>(async () => ({
      status: 206,
      headers: {
        "cache-control": "max-age=60",
        "content-range": "bytes 0-7/8",
        "content-type": "image/png",
      },
      body: body(png),
    }));

    const report = await verifyRealProductMedia({
      expectedMedia: [{ url: publicUrl, mediaType: "image" }],
      urlPolicy: {
        approvedLocations: [
          { origin: publicOrigin, pathPrefix: "/products/" },
        ],
        maxRedirects: 0,
        timeoutMs: 1_000,
      },
      httpClient: { request },
    });

    expect(request).toHaveBeenCalledOnce();
    expect(report.results[0]?.outcome).toBe("succeeded");
  });
});
