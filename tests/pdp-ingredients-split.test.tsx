import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/treat/ingredients-texture/hash.webp",
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

let mobile = true;
const viewportListeners = new Set<() => void>();

function resizeToMobile(value: boolean) {
  act(() => {
    mobile = value;
    for (const listener of viewportListeners) listener();
  });
}

beforeEach(() => {
  mobile = true;
  viewportListeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 820px)" && mobile,
    addEventListener: (_event: string, listener: () => void) => viewportListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => viewportListeners.delete(listener),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PdpIngredientsSplit", () => {
  it("keeps the phone education accessible and expands the complete list after its trigger", async () => {
    const user = userEvent.setup();
    render(
      <PdpIngredientsSplit
        productSlug="super-serum"
        productName="Super Serum"
        story={story}
        media={media}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={fullInci}
        mediaPosition="50% 50%"
        pdpPresentation="mobile-pilot"
      />,
    );

    const texture = screen.getByRole("img", { name: media.alt });
    const education = screen.getByRole("heading", { name: "what’s inside" });
    const trigger = screen.getByRole("button", { name: "FULL INGREDIENTS LIST" });
    const disclosure = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(disclosure).toHaveAttribute("aria-hidden", "true");
    expect(texture.compareDocumentPosition(education) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(education.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(trigger);
    const list = screen.getByRole("region", { name: "Super Serum complete ingredient list" });
    expect(disclosure).toHaveAttribute("aria-hidden", "false");
    expect(disclosure).toContainElement(list);
    expect(screen.getByRole("heading", { name: "what’s inside" })).toBe(education);
    expect(screen.getByRole("heading", { name: "PDRN" })).toBeVisible();
    expect(list).toHaveTextContent(fullInci.text);
    expect(trigger.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list).not.toHaveAttribute("tabindex");
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close full ingredients list" })).toHaveFocus();
  });

  it("preserves the open list and focused Close across the phone breakpoint", async () => {
    const user = userEvent.setup();
    render(
      <PdpIngredientsSplit
        productSlug="super-serum"
        productName="Super Serum"
        story={story}
        media={media}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={fullInci}
        mediaPosition="50% 50%"
        pdpPresentation="mobile-pilot"
      />,
    );

    const trigger = screen.getByRole("button", { name: "FULL INGREDIENTS LIST" });
    await user.click(trigger);
    await user.tab();
    const close = screen.getByRole("button", { name: "Close full ingredients list" });
    const list = screen.getByRole("region", { name: "Super Serum complete ingredient list" });

    resizeToMobile(false);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("heading", { name: "what’s inside" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Super Serum complete ingredient list" })).toBe(list);
    expect(list).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Close full ingredients list" })).toBe(close);
    expect(close).toHaveFocus();

    resizeToMobile(true);
    expect(screen.getByRole("heading", { name: "what’s inside" })).toBeVisible();
    expect(list).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("button", { name: "Close full ingredients list" })).toBe(close);
    expect(close).toHaveFocus();
    expect(screen.getAllByRole("button", { name: "FULL INGREDIENTS LIST" })).toHaveLength(1);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Super Serum complete ingredient list" })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(close);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

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
    const disclosure = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(disclosure).toHaveAttribute("aria-hidden", "true");

    expect(screen.getByRole("heading", { name: "what’s inside" })).toBeVisible();
    expect(screen.getByText("PDRN")).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "ingredients" })).toBeVisible();
    expect(screen.getByText(fullInci.text)).toBeVisible();
    expect(disclosure).toHaveAttribute("aria-hidden", "false");
    expect(disclosure).toContainElement(screen.getByText(fullInci.text));
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

  it("leaves the disclosure and focus intact when another surface handles Escape", async () => {
    const user = userEvent.setup();
    render(
      <PdpIngredientsSplit
        productSlug="super-serum"
        productName="Super Serum"
        story={story}
        media={media}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={fullInci}
        mediaPosition="50% 50%"
        pdpPresentation="mobile-pilot"
      />,
    );
    const trigger = screen.getByRole("button", { name: "FULL INGREDIENTS LIST" });
    await user.click(trigger);
    await user.tab();
    const close = screen.getByRole("button", { name: "Close full ingredients list" });
    const handledEscape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    handledEscape.preventDefault();
    fireEvent(window, handledEscape);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it.each(["default", "mobile-pilot"] as const)("omits an unverified disclosure and reports missing texture media honestly (%s)", (pdpPresentation) => {
    render(
      <PdpIngredientsSplit
        productSlug="cleanse-01-calming-gel-cleanser"
        productName="CLEANSE"
        story={story}
        media={null}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={null}
        mediaPosition="50% 50%"
        pdpPresentation={pdpPresentation}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "FULL INGREDIENTS LIST" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Formula texture image is unavailable for CLEANSE.",
      ),
    ).toBeInTheDocument();
  });

  it.each(["default", "mobile-pilot"] as const)("replaces a failed texture image without changing ingredient controls (%s)", (pdpPresentation) => {
    render(
      <PdpIngredientsSplit
        productSlug="treat-03-pdrn-5-ampoule"
        productName="TREAT"
        story={story}
        media={media}
        swatch={["#d9e2dc", "#81998d"]}
        fullInci={fullInci}
        mediaPosition="50% 50%"
        pdpPresentation={pdpPresentation}
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
        name: `${media.alt} could not be loaded.`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "FULL INGREDIENTS LIST" }),
    ).toBeInTheDocument();
  });
});
