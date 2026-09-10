import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductImage } from "@/components/product/ProductImage";
import { requiresOriginalCatalogImage } from "@/lib/catalog/media-storage";
import { APPROVED_SUPABASE_PROJECT_REF } from "@/lib/supabase/project-safety";
import type { ProductMedia } from "@/lib/products";

const origin = `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`;
const primaryPath =
  "/storage/v1/object/public/helix-catalog/products/example-product/primary";
const hash = "a".repeat(64);
const originalUrl = `${origin}${primaryPath}/original/${hash}.webp`;
const ordinaryUrl = `${origin}${primaryPath}/${hash}.webp`;

function imageMedia(url: string): ProductMedia {
  return {
    kind: "image",
    url,
    alt: "Approved Product image",
    width: 1122,
    height: 1402,
    role: "card_default",
    sortOrder: 0,
    paletteId: null,
    palette: null,
  };
}

describe("Product image delivery", () => {
  it("serves explicitly marked images without optimizer URLs or responsive recompression", () => {
    render(
      <ProductImage
        media={imageMedia(originalUrl)}
        swatch={["#f5f5f5", "#f5f5f5"]}
        sizes="50vw"
      />,
    );

    const image = screen.getByRole("img", { name: "Approved Product image" });
    expect(image).toHaveAttribute("src", originalUrl);
    expect(image).not.toHaveAttribute("srcset");
  });

  it("keeps ordinary Product images optimized and responsive", () => {
    render(
      <ProductImage
        media={imageMedia(ordinaryUrl)}
        swatch={["#f5f5f5", "#f5f5f5"]}
        sizes="50vw"
      />,
    );

    const image = screen.getByRole("img", { name: "Approved Product image" });
    expect(image).toHaveAttribute(
      "src",
      expect.stringContaining(`/_next/image?url=${encodeURIComponent(ordinaryUrl)}`),
    );
    expect(image).toHaveAttribute("srcset", expect.stringContaining("640w"));
  });
});

describe("Original Product image URL policy", () => {
  it("requires the explicit immutable path in the approved project", () => {
    expect(requiresOriginalCatalogImage(originalUrl)).toBe(true);
  });

  it.each([
    ["ordinary image", ordinaryUrl],
    ["external origin", originalUrl.replace(origin, "https://example.com")],
    ["another project", originalUrl.replace(origin, "https://another-project.supabase.co")],
    ["lookalike origin", originalUrl.replace(".supabase.co", ".supabase.co.example.com")],
    ["insecure origin", originalUrl.replace("https:", "http:")],
    ["credentials", originalUrl.replace("https://", "https://user:password@")],
    ["nonstandard port", originalUrl.replace(origin, `${origin}:8443`)],
    ["query", `${originalUrl}?download=1`],
    ["empty query", `${originalUrl}?`],
    ["fragment", `${originalUrl}#original`],
    ["empty fragment", `${originalUrl}#`],
    ["relative URL", `${primaryPath}/original/${hash}.webp`],
    ["malformed URL", "not a URL"],
    ["incorrect bucket", originalUrl.replace("helix-catalog/", "other-bucket/")],
    ["incorrect role path", originalUrl.replace("/primary/", "/profile/")],
    ["missing product folder", originalUrl.replace("/example-product", "")],
    ["incorrect hash", originalUrl.replace(hash, "not-a-content-hash")],
    ["incorrect format", originalUrl.replace(".webp", ".jpg")],
    ["extra path segment", originalUrl.replace("/original/", "/original/nested/")],
    ["normalized path", originalUrl.replace("/primary/", "/unused/../primary/")],
    ["trailing newline", `${originalUrl}\n`],
  ])("does not bypass optimization for %s", (_label, url) => {
    expect(requiresOriginalCatalogImage(url)).toBe(false);
  });
});
