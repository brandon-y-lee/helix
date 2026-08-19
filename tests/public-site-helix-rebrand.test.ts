import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Manrope: () => ({ variable: "font-ui" }),
  Marcellus: () => ({ variable: "font-display" }),
}));

import { metadata as rootMetadata } from "@/app/layout";
import { metadata as homeMetadata } from "@/app/page";
import { metadata as aboutMetadata } from "@/app/about/page";
import { metadata as systemMetadata } from "@/app/system/page";
import { generateMetadata as generateCollectionMetadata } from "@/app/collections/[collection]/page";
import { metadata as searchMetadata } from "@/app/search/page";
import { metadata as notFoundMetadata } from "@/app/not-found";

describe("Public Site helix identity", () => {
  it("identifies helix consistently in route and social metadata", async () => {
    expect(rootMetadata).toMatchObject({
      applicationName: "helix",
      title: "helix — Prestige Skincare for Men",
      openGraph: { siteName: "helix" },
    });
    expect(homeMetadata).toMatchObject({
      title: "helix | Men's Skincare",
      openGraph: { siteName: "helix", url: "/" },
      twitter: { title: "helix | Men's Skincare" },
    });
    expect(aboutMetadata).toMatchObject({
      title: "About helix | Seoul Precision, Los Angeles Perspective",
      openGraph: { siteName: "helix" },
    });
    expect(systemMetadata).toMatchObject({
      title: "The System | helix",
      openGraph: { siteName: "helix" },
    });
    expect(
      await generateCollectionMetadata({
        params: Promise.resolve({ collection: "shop" }),
      }),
    ).toMatchObject({
      title: "Shop All | helix",
      openGraph: { siteName: "helix", url: "/collections/shop" },
      twitter: { title: "Shop All | helix" },
    });
    expect(searchMetadata).toMatchObject({
      title: "Search | helix",
      openGraph: { siteName: "helix", url: "/search" },
    });
    expect(notFoundMetadata).toMatchObject({
      title: "Not found | helix",
    });
  });
});
