import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PdpIngredientsSplit } from "@/components/product-detail/PdpIngredientsSplit";
import type { PdpIngredientStory } from "@/lib/catalog/product-content";
import type { ProductMedia } from "@/lib/products";

const story: PdpIngredientStory = {
  heading: "what’s inside",
  intro: "A focused ingredient introduction.",
  highlights: [
    { name: "PDRN", description: "a conditioning ingredient" },
    { name: "NIACINAMIDE", description: "a form of vitamin B3" },
  ],
  supportingIngredients: "also made with TREHALOSE, ADENOSINE",
};

const media: ProductMedia = {
  kind: "image",
  url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/treat/ingredients-texture/hash.webp",
  alt: "Golden TREAT serum formula texture with suspended air bubbles.",
  width: 1254,
  height: 1254,
  role: "ingredients_texture",
  sortOrder: 23,
  paletteId: null,
  palette: null,
};

const fullInci = {
  text: "Water, Glycerin, Niacinamide, Panthenol, Adenosine",
  source: "products.ingredients" as const,
};

describe("PdpIngredientsSplit", () => {
  it("replaces only the left story, preserves the image, and restores focus", async () => {
    const user = userEvent.setup();
    render(
      <PdpIngredientsSplit
        productSlug="treat-03-pdrn-5-ampoule"
        productName="TREAT"
        story={story}
        media={media}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={fullInci}
        mediaPosition="50% 50%"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "FULL INGREDIENTS LIST",
    });
    const mediaNode = screen.getByTestId("pdp-ingredients-media");

    expect(screen.getByRole("heading", { name: "what’s inside" })).toBeVisible();
    expect(screen.getByText("PDRN")).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "ingredients" })).toBeVisible();
    expect(screen.getByText(fullInci.text)).toBeVisible();
    expect(screen.getByTestId("pdp-ingredients-media")).toBe(mediaNode);

    const close = screen.getByRole("button", {
      name: "Close full ingredients list",
    });
    expect(close).toHaveFocus();
    await user.click(close);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and returns focus to the disclosure trigger", async () => {
    const user = userEvent.setup();
    render(
      <PdpIngredientsSplit
        productSlug="treat-03-pdrn-5-ampoule"
        productName="TREAT"
        story={story}
        media={media}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={fullInci}
        mediaPosition="50% 50%"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "FULL INGREDIENTS LIST",
    });
    await user.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("omits an unverified disclosure and reports missing texture media honestly", () => {
    render(
      <PdpIngredientsSplit
        productSlug="cleanse-01-calming-gel-cleanser"
        productName="CLEANSE"
        story={story}
        media={null}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={null}
        mediaPosition="50% 50%"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "FULL INGREDIENTS LIST" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Formula texture image is temporarily unavailable for CLEANSE.",
      ),
    ).toBeInTheDocument();
  });

  it("replaces a failed texture image without changing ingredient controls", () => {
    render(
      <PdpIngredientsSplit
        productSlug="treat-03-pdrn-5-ampoule"
        productName="TREAT"
        story={story}
        media={media}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={fullInci}
        mediaPosition="50% 50%"
      />,
    );
    const mediaNode = screen.getByTestId("pdp-ingredients-media");
    fireEvent.error(screen.getByRole("img", { name: media.alt }));

    expect(mediaNode.querySelector("img")).toBeNull();
    expect(
      mediaNode.querySelector('[data-media-fallback="load-error"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole("status", {
        name: `${media.alt} is temporarily unavailable.`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "FULL INGREDIENTS LIST" }),
    ).toBeInTheDocument();
  });
});
