export type CatalogProductMediaType = "image" | "video";

export type ExpectedProductMedia = Readonly<{
  url: string;
  mediaType: CatalogProductMediaType;
}>;

export type ApprovedProductMediaLocation = Readonly<{
  origin: string;
  pathPrefix: string;
}>;

export type PublicProductMediaUrlPolicy = Readonly<{
  approvedLocations: readonly ApprovedProductMediaLocation[];
  maxRedirects: number;
  timeoutMs: number;
}>;

export type ProductMediaHttpRequest = Readonly<{
  method: "GET";
  url: string;
  headers: Readonly<{ Range: "bytes=0-31" }>;
  credentials: "omit";
  redirect: "manual";
  signal: AbortSignal;
}>;

export type ProductMediaHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: ReadableStream<Uint8Array> | null;
}>;

export type ProductMediaHttpClient = Readonly<{
  request(
    request: ProductMediaHttpRequest,
  ): Promise<ProductMediaHttpResponse>;
}>;

export type ProductMediaVerificationFailure = Readonly<{
  code: string;
  message: string;
}>;

export type ProductMediaVerificationResult = Readonly<{
  url: string;
  expectedMediaType: CatalogProductMediaType;
  outcome: "succeeded" | "failed";
  failure: ProductMediaVerificationFailure | null;
  status: number | null;
  receivedBytes: number;
  totalBytes: number | null;
  contentType: string | null;
  redirects: number;
}>;

export type ProductMediaVerificationSummary = Readonly<{
  expectedRecords: number;
  distinctUrls: number;
  successes: number;
  failures: number;
  receivedBodyBytes: number;
  bodyBudgetBytes: number;
}>;

export type RealProductMediaVerificationReport = Readonly<{
  results: readonly ProductMediaVerificationResult[];
  summary: ProductMediaVerificationSummary;
}>;

export type VerifyRealProductMediaInput = Readonly<{
  expectedMedia: readonly ExpectedProductMedia[];
  urlPolicy: PublicProductMediaUrlPolicy;
  httpClient: ProductMediaHttpClient;
}>;

const RANGE_HEADER = "bytes=0-31" as const;

type ExpectedUrl = Readonly<{
  media: ExpectedProductMedia;
  conflicting: boolean;
}>;

function expectedUrls(
  records: readonly ExpectedProductMedia[],
): readonly ExpectedUrl[] {
  const byUrl = new Map<string, { media: ExpectedProductMedia; conflicting: boolean }>();
  for (const media of records) {
    const current = byUrl.get(media.url);
    if (!current) {
      byUrl.set(media.url, { media, conflicting: false });
      continue;
    }
    if (current.media.mediaType !== media.mediaType) current.conflicting = true;
  }
  return [...byUrl.values()];
}

function failedResult(
  expected: ExpectedProductMedia,
  failure: ProductMediaVerificationFailure,
  reportUrl = expected.url,
  details: Partial<Pick<
    ProductMediaVerificationResult,
    "status" | "receivedBytes" | "totalBytes" | "contentType" | "redirects"
  >> = {},
): ProductMediaVerificationResult {
  return Object.freeze({
    url: reportUrl,
    expectedMediaType: expected.mediaType,
    outcome: "failed",
    failure: Object.freeze(failure),
    status: details.status ?? null,
    receivedBytes: details.receivedBytes ?? 0,
    totalBytes: details.totalBytes ?? null,
    contentType: details.contentType ?? null,
    redirects: details.redirects ?? 0,
  });
}

const SIGNED_QUERY_PARAMETER = /^(?:token|signature|expires?|authorization|api_?key|x-amz-.+|x-goog-.+)$/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isPrivateHostname(hostname: string): boolean {
  const host = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.includes(":")) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("::ffff:") ||
      /^f[cd]/.test(host) ||
      /^fe[89ab]/.test(host)
    );
  }
  const octets = host.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function containsPathEscape(value: string): boolean {
  const match = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*(?<path>[^?#]*)/i.exec(value);
  let path = match?.groups?.path ?? value.split(/[?#]/, 1)[0] ?? "";
  if (/[\\]|%2f|%5c/i.test(path)) return true;
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      path = decodeURIComponent(path);
    } catch {
      return true;
    }
    if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) return true;
  }
  return false;
}

function isKnownPrivateMediaEndpoint(pathname: string): boolean {
  return /^\/storage\/v1\/object\/(?:authenticated|sign)(?:\/|$)/.test(
    pathname,
  );
}

function approvedPublicUrl(
  value: string,
  policy: PublicProductMediaUrlPolicy,
): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      isPrivateHostname(url.hostname) ||
      isKnownPrivateMediaEndpoint(url.pathname) ||
      containsPathEscape(value) ||
      [...url.searchParams.keys()].some((key) =>
        SIGNED_QUERY_PARAMETER.test(key),
      )
    ) {
      return null;
    }
    const approved = policy.approvedLocations.some((location) => {
      const origin = new URL(location.origin);
      const pathPrefix = location.pathPrefix.endsWith("/")
        ? location.pathPrefix
        : `${location.pathPrefix}/`;
      return (
        origin.protocol === "https:" &&
        !origin.username &&
        !origin.password &&
        origin.pathname === "/" &&
        !origin.search &&
        !origin.hash &&
        !isPrivateHostname(origin.hostname) &&
        url.origin === origin.origin &&
        location.pathPrefix.startsWith("/") &&
        !location.pathPrefix.includes("?") &&
        !location.pathPrefix.includes("#") &&
        (url.pathname === location.pathPrefix ||
          url.pathname.startsWith(pathPrefix))
      );
    });
    return approved ? url : null;
  } catch {
    return null;
  }
}

function safeReportUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SIGNED_QUERY_PARAMETER.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.href;
  } catch {
    return "[invalid Product Media URL]";
  }
}

function isAbortError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    value.name === "AbortError"
  );
}

function header(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  );
  return entry?.[1];
}

async function readBody(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<Readonly<{ bytes: Uint8Array; exceeded: boolean }>> {
  const reader = stream.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maximumBytes - length;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        length += Math.max(remaining, 0);
        await reader.cancel();
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { bytes, exceeded: true };
      }
      if (value.byteLength > 0) {
        chunks.push(value);
        length += value.byteLength;
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, exceeded: false };
}

type ParsedContentRange = Readonly<{
  start: number;
  end: number;
  total: number;
}>;

function parseContentRange(value: string | undefined): ParsedContentRange | null {
  const match = value ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value) : null;
  if (!match) return null;
  const [, startValue, endValue, totalValue] = match;
  const start = Number(startValue);
  const end = Number(endValue);
  const total = Number(totalValue);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start !== 0 ||
    total <= 0 ||
    end !== Math.min(31, total - 1)
  ) {
    return null;
  }
  return { start, end, total };
}

type SupportedContentType = "image/png" | "image/webp" | "video/mp4";

function normalizedContentType(value: string | null): string | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function leadingByteContentType(bytes: Uint8Array): SupportedContentType | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.byteLength >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "video/mp4";
  }
  return null;
}

function catalogTypeForContentType(
  contentType: SupportedContentType,
): CatalogProductMediaType {
  return contentType === "video/mp4" ? "video" : "image";
}

function hasPositivePublicCacheLifetime(value: string | undefined): boolean {
  if (!value) return false;
  let maxAge: number | null = null;
  for (const rawDirective of value.split(",")) {
    const [rawName, rawValue] = rawDirective.trim().split("=", 2);
    const name = rawName?.toLowerCase();
    if (name === "private" || name === "no-store") return false;
    if (name !== "max-age") continue;
    const normalizedValue = rawValue?.trim().replace(/^"|"$/g, "");
    if (!normalizedValue || !/^\d+$/.test(normalizedValue)) return false;
    const parsed = Number(normalizedValue);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return false;
    if (maxAge !== null && maxAge !== parsed) return false;
    maxAge = parsed;
  }
  return maxAge !== null;
}

async function verifyOne(
  expected: ExpectedProductMedia,
  input: VerifyRealProductMediaInput,
): Promise<ProductMediaVerificationResult> {
  if (!approvedPublicUrl(expected.url, input.urlPolicy)) {
    return failedResult(
      expected,
      {
        code: "initial_url_rejected",
        message:
          "The initial URL is not an approved public Customer Product Media URL.",
      },
      safeReportUrl(expected.url),
    );
  }
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("Product Media verification timed out."));
    }, input.urlPolicy.timeoutMs);
  });
  const beforeTimeout = <Value>(operation: Promise<Value>): Promise<Value> =>
    Promise.race([operation, timeoutFailure]);
  try {
    let currentUrl = expected.url;
    let redirects = 0;
    let response: ProductMediaHttpResponse;
    while (true) {
      response = await beforeTimeout(input.httpClient.request({
        method: "GET",
        url: currentUrl,
        headers: { Range: RANGE_HEADER },
        credentials: "omit",
        redirect: "manual",
        signal: controller.signal,
      }));
      if (!REDIRECT_STATUSES.has(response.status)) break;
      if (response.body) await beforeTimeout(response.body.cancel());
      const location = header(response.headers, "location");
      if (!location) {
        return failedResult(expected, {
          code: "redirect_missing_location",
          message: "The redirect response did not identify a destination.",
        }, expected.url, { status: response.status, redirects });
      }
      if (redirects >= input.urlPolicy.maxRedirects) {
        return failedResult(expected, {
          code: "redirect_limit_exceeded",
          message: "The Product Media response exceeded the redirect limit.",
        }, expected.url, { status: response.status, redirects });
      }
      if (containsPathEscape(location)) {
        return failedResult(expected, {
          code: "redirect_rejected",
          message:
            "The redirect left the approved public Customer Product Media policy.",
        }, expected.url, { status: response.status, redirects });
      }
      const destination = new URL(location, currentUrl).href;
      if (!approvedPublicUrl(destination, input.urlPolicy)) {
        return failedResult(expected, {
          code: "redirect_rejected",
          message:
            "The redirect left the approved public Customer Product Media policy.",
        }, expected.url, { status: response.status, redirects });
      }
      currentUrl = destination;
      redirects += 1;
    }
    if (response.status !== 206) {
      if (response.body) await beforeTimeout(response.body.cancel());
      return failedResult(expected, {
        code: "range_not_honored",
        message: "The response did not honor the requested byte range.",
      }, expected.url, { status: response.status, redirects });
    }
    const contentRange = parseContentRange(
      header(response.headers, "content-range"),
    );
    if (!contentRange) {
      if (response.body) await beforeTimeout(response.body.cancel());
      return failedResult(expected, {
        code: "malformed_range",
        message: "The response contained an invalid byte range.",
      }, expected.url, { status: response.status, redirects });
    }
    const expectedBytes = contentRange.end - contentRange.start + 1;
    const contentLengthValue = header(response.headers, "content-length");
    if (contentLengthValue !== undefined) {
      const contentLength = Number(contentLengthValue);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        if (response.body) await beforeTimeout(response.body.cancel());
        return failedResult(expected, {
          code: "malformed_range",
          message: "The response contained an invalid byte range.",
        }, expected.url, {
          status: response.status,
          totalBytes: contentRange.total,
          redirects,
        });
      }
      if (contentLength > expectedBytes) {
        if (response.body) await beforeTimeout(response.body.cancel());
        return failedResult(expected, {
          code: "excessive_response",
          message: "The response body exceeded the requested byte range.",
        }, expected.url, {
          status: response.status,
          totalBytes: contentRange.total,
          redirects,
        });
      }
      if (contentLength !== expectedBytes) {
        if (response.body) await beforeTimeout(response.body.cancel());
        return failedResult(expected, {
          code: "malformed_range",
          message: "The response contained an invalid byte range.",
        }, expected.url, {
          status: response.status,
          totalBytes: contentRange.total,
          redirects,
        });
      }
    }
    const contentType = header(response.headers, "content-type") ?? null;
    const body = response.body
      ? await beforeTimeout(
          readBody(response.body, expectedBytes, controller.signal),
        )
      : { bytes: new Uint8Array(), exceeded: false };
    if (body.exceeded) {
      return failedResult(expected, {
        code: "excessive_response",
        message: "The response body exceeded the requested byte range.",
      }, expected.url, {
        status: response.status,
        receivedBytes: body.bytes.byteLength,
        totalBytes: contentRange.total,
        contentType,
        redirects,
      });
    }
    const bytes = body.bytes;
    if (bytes.byteLength !== expectedBytes) {
      return failedResult(expected, {
        code: "incomplete_response",
        message: "The response body did not match the declared byte range.",
      }, expected.url, {
        status: response.status,
        receivedBytes: bytes.byteLength,
        totalBytes: contentRange.total,
        contentType,
        redirects,
      });
    }
    const declaredContentType = normalizedContentType(contentType);
    const supportedContentTypes = new Set<string>([
      "image/png",
      "image/webp",
      "video/mp4",
    ]);
    if (!declaredContentType || !supportedContentTypes.has(declaredContentType)) {
      return failedResult(expected, {
        code: "unsupported_media_format",
        message: "The declared Product Media format is not supported.",
      }, expected.url, {
        status: response.status,
        receivedBytes: bytes.byteLength,
        totalBytes: contentRange.total,
        contentType,
        redirects,
      });
    }
    const signatureContentType = leadingByteContentType(bytes);
    if (
      signatureContentType !== declaredContentType ||
      catalogTypeForContentType(declaredContentType as SupportedContentType) !==
        expected.mediaType
    ) {
      return failedResult(expected, {
        code: "media_mismatch",
        message:
          "The Catalog media type, declared content type, and leading-byte signature did not agree.",
      }, expected.url, {
        status: response.status,
        receivedBytes: bytes.byteLength,
        totalBytes: contentRange.total,
        contentType,
        redirects,
      });
    }
    if (
      !hasPositivePublicCacheLifetime(
        header(response.headers, "cache-control"),
      )
    ) {
      return failedResult(expected, {
        code: "unsafe_cache_policy",
        message:
          "The response did not advertise a positive public max-age without private or no-store.",
      }, expected.url, {
        status: response.status,
        receivedBytes: bytes.byteLength,
        totalBytes: contentRange.total,
        contentType,
        redirects,
      });
    }
    return Object.freeze({
      url: expected.url,
      expectedMediaType: expected.mediaType,
      outcome: "succeeded" as const,
      failure: null,
      status: response.status,
      receivedBytes: bytes.byteLength,
      totalBytes: contentRange.total,
      contentType,
      redirects,
    });
  } catch (error) {
    if (timedOut) {
      return failedResult(expected, {
        code: "request_timeout",
        message: "The Product Media request exceeded its time limit.",
      });
    }
    if (isAbortError(error)) {
      return failedResult(expected, {
        code: "request_aborted",
        message: "The Product Media request was aborted before completion.",
      });
    }
    return failedResult(expected, {
      code: "network_error",
      message: "The Product Media request failed before verification completed.",
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function verifyRealProductMedia(
  input: VerifyRealProductMediaInput,
): Promise<RealProductMediaVerificationReport> {
  const distinctMedia = expectedUrls(input.expectedMedia);
  const results = Object.freeze(
    await Promise.all(distinctMedia.map(({ media, conflicting }) =>
      conflicting
        ? failedResult(media, {
            code: "conflicting_expectations",
            message: "Conflicting Catalog media types were provided for this URL.",
          }, safeReportUrl(media.url))
        : verifyOne(media, input),
    )),
  );
  const successes = results.filter(
    (result) => result.outcome === "succeeded",
  ).length;
  const summary = Object.freeze({
    expectedRecords: input.expectedMedia.length,
    distinctUrls: distinctMedia.length,
    successes,
    failures: results.length - successes,
    receivedBodyBytes: results.reduce(
      (total, result) => total + result.receivedBytes,
      0,
    ),
    bodyBudgetBytes: distinctMedia.length * 32,
  });
  return Object.freeze({ results, summary });
}
