import type { Page, Route } from "@playwright/test";
import type { StorefrontSnapshot } from "@/test-support/storefront-baseline";

const TEST_IMAGE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const TEST_VIDEO = Buffer.from(
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMxbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAFAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlt0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAABQAAAAAAABAAAAAAHTbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAABABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT5zdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAMg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAARmkAAAAAAAAABhzdHRzAAAAAAAAAAEAAAACAAACAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAACxQAAAAwAAAAUc3RjbwAAAAAAAAABAAADYQAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjIuMTIuMTAyAAAACGZyZWUAAALZbWRhdAAAAq4GBf//qtxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjUgcjMyMjIgYjM1NjA1YSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjUgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMiBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAA9liIQAL//+9q78yyt0f4EAAAAIQZohbEK//sA=",
  "base64",
);

type ContainedMedia = Readonly<{
  kind: "image" | "video";
  roles: ReadonlySet<string>;
}>;

export type ProductMediaContainmentOptions = Readonly<{
  approvedMediaOrigin: string;
}>;

export type ProductMediaContainmentReport = Readonly<{
  containedRequests: number;
  imageRequests: number;
  videoRequests: number;
  posterRequests: number;
  optimizedImageRequests: number;
  rejectedRequests: number;
}>;

type MutableContainmentReport = {
  -readonly [Key in keyof ProductMediaContainmentReport]: number;
};

const RESPONSE_BY_KIND = {
  image: {
    body: TEST_IMAGE,
    contentType: "image/png",
    counter: "imageRequests",
  },
  video: {
    body: TEST_VIDEO,
    contentType: "video/mp4",
    counter: "videoRequests",
  },
} as const;

function mediaKey(value: string): string | null {
  try {
    if (value.startsWith("/") && !value.startsWith("//")) {
      const url = new URL(value, "https://same-site.invalid");
      return `same-site:${url.pathname}${url.search}`;
    }
    const url = new URL(value);
    url.hash = "";
    return `absolute:${url.href}`;
  } catch {
    return null;
  }
}

function approvedOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.origin;
  } catch {
    // Use the common diagnostic below.
  }
  throw new Error("Product Media containment requires one approved HTTPS origin.");
}

function isPublicStorageRequest(value: string, origin: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === origin &&
      url.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

function productMedia(
  snapshot: StorefrontSnapshot,
): ReadonlyMap<string, ContainedMedia> {
  const mediaByUrl = new Map<
    string,
    { kind: "image" | "video"; roles: Set<string> }
  >();
  for (const product of snapshot.products) {
    for (const media of product.media) {
      if (!media.url || media.kind === "placeholder") continue;
      const key = mediaKey(media.url);
      if (!key) continue;
      const current = mediaByUrl.get(key);
      if (current) {
        current.roles.add(media.role);
        continue;
      }
      mediaByUrl.set(key, {
        kind: media.kind,
        roles: new Set([media.role]),
      });
    }
  }
  return mediaByUrl;
}

function requestedMedia(requestUrl: string): {
  keys: readonly string[];
  optimized: boolean;
  sourceUrl: string | null;
} {
  try {
    const request = new URL(requestUrl);
    if (request.pathname === "/_next/image") {
      const source = request.searchParams.get("url");
      const key = source ? mediaKey(source) : null;
      return {
        keys: key ? [key] : [],
        optimized: true,
        sourceUrl: source,
      };
    }
    request.hash = "";
    return {
      keys: [
        `absolute:${request.href}`,
        `same-site:${request.pathname}${request.search}`,
      ],
      optimized: false,
      sourceUrl: request.href,
    };
  } catch {
    return { keys: [], optimized: false, sourceUrl: null };
  }
}

function isPoster(media: ContainedMedia): boolean {
  return [...media.roles].some((role) => role.includes("poster"));
}

export function createProductMediaContainment(
  snapshot: StorefrontSnapshot,
  options: ProductMediaContainmentOptions,
) {
  const mediaByUrl = productMedia(snapshot);
  const publicMediaOrigin = approvedOrigin(options.approvedMediaOrigin);
  const report: MutableContainmentReport = {
    containedRequests: 0,
    imageRequests: 0,
    videoRequests: 0,
    posterRequests: 0,
    optimizedImageRequests: 0,
    rejectedRequests: 0,
  };

  async function handle(route: Route): Promise<void> {
    const request = requestedMedia(route.request().url());
    const media = request.keys
      .map((key) => mediaByUrl.get(key))
      .find((candidate) => candidate !== undefined);
    if (media) {
      const response = RESPONSE_BY_KIND[media.kind];
      report.containedRequests += 1;
      report[response.counter] += 1;
      if (isPoster(media)) report.posterRequests += 1;
      if (request.optimized) report.optimizedImageRequests += 1;
      await route.fulfill({
        body: response.body,
        contentType: response.contentType,
        headers: {
          "cache-control": "no-store",
          "content-length": String(response.body.length),
        },
        status: 200,
      });
      return;
    }

    if (
      request.sourceUrl &&
      isPublicStorageRequest(request.sourceUrl, publicMediaOrigin)
    ) {
      report.rejectedRequests += 1;
      await route.abort("blockedbyclient");
      throw new Error(
        `Product Media request is absent from the live Storefront: ${request.sourceUrl}`,
      );
    }

    await route.fallback();
  }

  return Object.freeze({
    async install(page: Page): Promise<void> {
      await page.route("**/*", handle);
    },
    report(): ProductMediaContainmentReport {
      return Object.freeze({ ...report });
    },
  });
}
