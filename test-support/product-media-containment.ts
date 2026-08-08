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

export type ProductMediaContainmentReport = Readonly<{
  containedRequests: number;
  imageRequests: number;
  videoRequests: number;
  posterRequests: number;
  optimizedImageRequests: number;
  rejectedRequests: number;
}>;

function canonicalUrl(value: string): string | null {
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

function publicStorageScope(value: string): string | null {
  try {
    const url = new URL(value);
    const bucketPath = url.pathname.match(
      /^\/storage\/v1\/object\/public\/[^/]+\//,
    )?.[0];
    return url.protocol === "https:" && bucketPath
      ? `${url.origin}${bucketPath}`
      : null;
  } catch {
    return null;
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
      const url = canonicalUrl(media.url);
      if (!url || !publicStorageScope(url)) continue;
      const current = mediaByUrl.get(url);
      if (current) {
        current.roles.add(media.role);
        continue;
      }
      mediaByUrl.set(url, { kind: media.kind, roles: new Set([media.role]) });
    }
  }
  return mediaByUrl;
}

function requestedMedia(requestUrl: string): {
  optimized: boolean;
  url: string | null;
} {
  try {
    const request = new URL(requestUrl);
    if (request.pathname === "/_next/image") {
      const source = request.searchParams.get("url");
      return { optimized: true, url: source ? canonicalUrl(source) : null };
    }
    return { optimized: false, url: request.href };
  } catch {
    return { optimized: false, url: null };
  }
}

function isPoster(media: ContainedMedia): boolean {
  return [...media.roles].some((role) => role.includes("poster"));
}

export function createProductMediaContainment(snapshot: StorefrontSnapshot) {
  const mediaByUrl = productMedia(snapshot);
  const storageScopes = new Set(
    [...mediaByUrl.keys()].flatMap((url) => {
      const scope = publicStorageScope(url);
      return scope ? [scope] : [];
    }),
  );
  const report = {
    containedRequests: 0,
    imageRequests: 0,
    videoRequests: 0,
    posterRequests: 0,
    optimizedImageRequests: 0,
    rejectedRequests: 0,
  };

  async function handle(route: Route): Promise<void> {
    const request = requestedMedia(route.request().url());
    const media = request.url ? mediaByUrl.get(request.url) : undefined;
    if (media) {
      report.containedRequests += 1;
      report[media.kind === "image" ? "imageRequests" : "videoRequests"] += 1;
      if (isPoster(media)) report.posterRequests += 1;
      if (request.optimized) report.optimizedImageRequests += 1;
      const body = media.kind === "image" ? TEST_IMAGE : TEST_VIDEO;
      await route.fulfill({
        body,
        contentType: media.kind === "image" ? "image/png" : "video/mp4",
        headers: {
          "cache-control": "no-store",
          "content-length": String(body.length),
        },
        status: 200,
      });
      return;
    }

    const scope = request.url ? publicStorageScope(request.url) : null;
    if (scope && storageScopes.has(scope)) {
      report.rejectedRequests += 1;
      await route.abort("blockedbyclient");
      throw new Error(
        `Product-media request is absent from the live Storefront: ${request.url}`,
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
