import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductImage } from "@/components/product/ProductImage";
import { PdpGalleryIsland } from "@/components/product-detail/PdpGalleryIsland";
import type { ProductMedia } from "@/lib/products";

function productImage(label: string, sortOrder: number): ProductMedia {
  return {
    kind: "image",
    url: `https://example.supabase.co/${label}.webp`,
    alt: `${label} Product image`,
    width: 1200,
    height: 1200,
    role: "gallery",
    sortOrder,
    paletteId: null,
    palette: null,
  };
}

function productVideo(label: string, sortOrder: number): ProductMedia {
  return {
    kind: "video",
    url: `https://example.supabase.co/${label}.mp4`,
    alt: `${label} Product video`,
    width: 720,
    height: 1280,
    role: "gallery",
    sortOrder,
    paletteId: null,
    palette: null,
  };
}

describe("Storefront Product Media fallback", () => {
  it("replaces only a failed Product image with its Product Swatch", () => {
    const failedMedia = productImage("Failed", 1);
    const healthyMedia = productImage("Healthy", 2);
    const { container } = render(
      <>
        <ProductImage
          media={failedMedia}
          swatch={["#112233", "#445566"]}
          className="failed-position"
          imageClassName="media"
          sizes="50vw"
        />
        <ProductImage
          media={healthyMedia}
          swatch={["#aabbcc", "#ddeeff"]}
          className="healthy-position"
          imageClassName="media"
          sizes="50vw"
        />
      </>,
    );

    fireEvent.error(screen.getByRole("img", { name: failedMedia.alt }));

    const failed = container.querySelector(".failed-position");
    const healthy = container.querySelector(".healthy-position");
    expect(failed).toHaveAttribute("data-media-kind", "placeholder");
    expect(failed).toHaveAttribute("data-media-fallback", "load-error");
    expect(failed?.querySelector("img")).toBeNull();
    expect(failed?.querySelector(".media")).toHaveStyle({
      position: "absolute",
      inset: "0",
    });
    expect(
      screen.getByRole("status", {
        name: "Failed Product image could not be loaded.",
      }),
    ).toBeInTheDocument();

    expect(healthy).toHaveAttribute("data-media-kind", "image");
    expect(healthy).not.toHaveAttribute("data-media-fallback");
    expect(
      screen.getByRole("img", { name: healthyMedia.alt }),
    ).toHaveAttribute("src", expect.stringContaining("Healthy.webp"));
  });

  it("degrades a failed Product video without breaking the gallery", () => {
    const failedVideo = productVideo("Failed", 1);
    const healthyImage = productImage("Healthy", 2);
    const { container } = render(
      <PdpGalleryIsland
        productKey="cleanse"
        detailMedia={null}
        items={[
          {
            id: "video",
            description: "video view",
            media: failedVideo,
            swatch: ["#112233", "#445566"],
          },
          {
            id: "image",
            description: "image view",
            media: healthyImage,
            swatch: ["#aabbcc", "#ddeeff"],
          },
        ]}
      />,
    );

    const activeSlide = container.querySelector(
      '[data-pdp-gallery-slide][data-state="active"]',
    );
    const failedPosition = activeSlide?.querySelector(".pdp__media-content");
    const foreground = failedPosition?.querySelector("video");
    if (!foreground) throw new Error("Expected active Product video");
    fireEvent.error(foreground);

    expect(failedPosition).toHaveAttribute("data-media-kind", "placeholder");
    expect(failedPosition).toHaveAttribute(
      "data-media-fallback",
      "load-error",
    );
    expect(failedPosition?.querySelector("video")).toBeNull();
    expect(
      screen.getByRole("status", {
        name: "Failed Product video could not be loaded.",
      }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-pdp-gallery-state="2"] img'),
    ).toHaveAttribute("src", expect.stringContaining("Healthy.webp"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "View image view, media 2 of 2",
      }),
    );
    expect(
      container.querySelector('[data-pdp-gallery-state="2"]'),
    ).toHaveAttribute("data-state", "active");
    expect(
      screen.getByRole("button", {
        name: "View image view, media 2 of 2",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
