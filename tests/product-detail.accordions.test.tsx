import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDetail } from "@/components/ProductDetail";
import type { Product } from "@/lib/products";

const cartMock = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock("@/components/CartProvider", () => ({
  useCart: () => cartMock,
}));

vi.mock("@/components/AfterpayMessaging", () => ({
  AfterpayMessaging: ({
    amount,
    currency,
    publishableKey,
  }: {
    amount: number;
    currency: string;
    publishableKey: string | null;
  }) =>
    publishableKey ? (
      <div
        data-testid="afterpay-messaging-boundary"
        data-amount={amount}
        data-currency={currency}
      />
    ) : null,
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  const editorialMedia: Product["media"] = [
    {
      kind: "video",
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/treat/routine/video.mp4",
      alt: "TREAT routine application video.",
      width: 720,
      height: 1280,
      role: "routine_video",
      sortOrder: 20,
      paletteId: null,
      palette: null,
    },
    {
      kind: "image",
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/treat/routine/poster.webp",
      alt: "TREAT routine video poster showing skincare application.",
      width: 720,
      height: 1280,
      role: "routine_video_poster",
      sortOrder: 21,
      paletteId: null,
      palette: null,
    },
    {
      kind: "image",
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/treat/profile/profile.webp",
      alt: "TREAT bottle with wood-grain cap on a warm neutral backdrop.",
      width: 1122,
      height: 1402,
      role: "profile_editorial",
      sortOrder: 22,
      paletteId: null,
      palette: null,
    },
    {
      kind: "image",
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/treat/ingredients-texture/texture.webp",
      alt: "Golden TREAT serum formula texture with suspended air bubbles.",
      width: 1254,
      height: 1254,
      role: "ingredients_texture",
      sortOrder: 23,
      paletteId: null,
      palette: null,
    },
  ];
  const base: Product = {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "treat-03-pdrn-5-ampoule",
    displayName: "TREAT",
    formalTitle: "TREAT 02 PDRN 5 Ampoule",
    name: "TREAT",
    tagline: "Bounce and glow",
    cardTagline: "Bounce and glow",
    collection: "The Core",
    actionName: null,
    routineNumber: "02",
    routineGroup: "core",
    routineGroupLabel: "The Core",
    routineStepNumber: 2,
    routineStepName: "Treat",
    routineDisplayLabel: "02 — The Core",
    routineSort: 20,
    subtitle: "Bounce and glow",
    descriptor: "A daily ampoule.",
    productType: "Ampoule",
    badge: null,
    currency: "USD",
    featuredRank: 0,
    sortOrder: 0,
    blurb: "A daily ampoule.",
    description: "A daily ampoule for smoother-looking bounce.",
    editorialDescription:
      "A light daily ampoule that helps skin look smoother, bouncier, and more switched on. Built for the step after cleansing.",
    benefits: [
      "Helps skin look smoother and more replenished",
      "Supports a bouncier-looking finish",
      "Layers cleanly under moisturizer",
    ],
    howToUse: "Apply after cleansing.",
    editorialHowToUse:
      "Pat a few drops over clean skin after REFINE. Follow with SEAL.",
    formulaNotes: ["Source formulation highlights PDRN and niacinamide."],
    variants: [
      {
        id: "15ml",
        label: "15 mL",
        price: 2500,
        compareAtPrice: null,
        sku: null,
        available: true,
        inventoryStatus: "in_stock",
        volume: "15 mL",
        packCount: null,
        optionValues: { size: "15 mL" },
        sortOrder: 0,
      },
    ],
    swatch: ["#edf4f5", "#87a3aa"],
    media: editorialMedia,
    cardMedia: null,
    cardHoverMedia: null,
    heroMedia: null,
    detailMedia: null,
    cartMedia: null,
    searchMedia: null,
    status: "available",
    catalogStatus: "active",
    madeFor: "Dull-looking skin",
    goodFor: "Dullness, dehydration, uneven-looking texture",
    texture: "Lightweight concentrated serum",
    keyIngredients: ["PDRN", "Niacinamide", "Peptides"],
    ingredients: "Water, Niacinamide, PDRN, Peptides",
    productDetails: {},
    cautions: [],
    finish: "Clean, hydrated, non-sticky",
    volume: "15 mL",
    skinTypes: ["All skin types"],
    concerns: ["Dullness", "Texture"],
    routineStep: "Treat",
    routineOrder: 3,
    usageTime: ["Morning", "Night"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function before(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  cartMock.add.mockReset();
  cartMock.add.mockResolvedValue(true);
});

describe("ProductDetail purchase accordions", () => {
  it("renders accordions directly after the add-to-cart action", () => {
    render(<ProductDetail product={makeProduct()} />);

    const add = screen.getByRole("button", { name: /Add to cart/ });
    const does = screen.getByRole("button", { name: /WHAT IT DOES/ });
    const use = screen.getByRole("button", { name: /HOW TO USE/ });
    const ingredients = screen.getByRole("button", { name: /KEY INGREDIENTS/ });
    const profile = screen.getByRole("heading", {
      name: "A lightweight PDRN SERUM for HYDRATION, smoother-looking texture, and a steadier GLOW.",
    });
    const outcomes = screen.getByRole("heading", {
      name: "YOUR DAILY TREATMENT THAT:",
    });
    const application = screen.getByRole("heading", { name: "APPLICATION" });
    const inside = screen.getByRole("heading", { name: "what’s inside" });
    const doesPanel = document.getElementById("pdp-does-heading");
    const details = screen.getByRole("heading", { name: "DETAILS" });

    expect(before(add, does)).toBe(true);
    expect(before(does, use)).toBe(true);
    expect(before(use, ingredients)).toBe(true);
    expect(before(ingredients, profile)).toBe(true);
    expect(before(profile, outcomes)).toBe(true);
    expect(before(outcomes, application)).toBe(true);
    expect(before(application, inside)).toBe(true);
    expect(doesPanel).toBeInstanceOf(HTMLElement);
    expect(before(inside, doesPanel as HTMLElement)).toBe(true);
    expect(before(doesPanel as HTMLElement, details)).toBe(true);
    expect(
      screen.queryByRole("heading", { name: "INGREDIENTS" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "QUICK SIGNALS" }),
    ).not.toBeInTheDocument();
  });

  it("uses a single-open collapsible accordion group", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={makeProduct()} />);

    const does = screen.getByRole("button", { name: /WHAT IT DOES/ });
    const use = screen.getByRole("button", { name: /HOW TO USE/ });
    const doesPanel = document.getElementById("pdp-accordion-does-panel");
    const usePanel = document.getElementById("pdp-accordion-use-panel");

    await user.click(does);
    expect(does).toHaveAttribute("aria-expanded", "true");
    expect(doesPanel).toHaveAttribute("data-open", "true");

    await user.click(use);
    expect(does).toHaveAttribute("aria-expanded", "false");
    expect(doesPanel).toHaveAttribute("data-open", "false");
    expect(use).toHaveAttribute("aria-expanded", "true");
    expect(usePanel).toHaveAttribute("data-open", "true");

    await user.click(use);
    expect(use).toHaveAttribute("aria-expanded", "false");
    expect(usePanel).toHaveAttribute("data-open", "false");
  });

  it("links Core key ingredients to the structured ingredient module", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={makeProduct()} />);

    await user.click(screen.getByRole("button", { name: /KEY INGREDIENTS/ }));

    expect(screen.getByText("PDRN")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Explore ingredients" }),
    ).toHaveAttribute(
      "href",
      "#pdp-ingredients-treat-03-pdrn-5-ampoule",
    );
    expect(document.getElementById("full-ingredients")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "FULL INGREDIENTS LIST" }),
    ).toBeInTheDocument();
  });

  it("keeps lower editorial panels finite across buttons, keyboard, and horizontal wheel", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={makeProduct()} />);

    const group = screen.getByRole("group", { name: "What it does" });
    const previous = within(group).getByRole("button", {
      name: "Previous What it does",
    });
    const next = within(group).getByRole("button", {
      name: "Next What it does",
    });
    const position = screen.getByLabelText("What it does item position");

    expect(position).toHaveTextContent("01 / 03");
    expect(previous).toBeDisabled();

    await user.click(next);
    expect(position).toHaveTextContent("02 / 03");
    expect(previous).not.toBeDisabled();

    group.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(position).toHaveTextContent("03 / 03");
    expect(next).toBeDisabled();

    const viewport = group.querySelector(".pdp-panel-sequence__viewport");
    expect(viewport).toBeInstanceOf(HTMLElement);
    fireEvent.wheel(viewport as HTMLElement, { deltaX: 96, deltaY: 0 });
    expect(position).toHaveTextContent("03 / 03");

    await new Promise((resolve) => window.setTimeout(resolve, 280));
    fireEvent.wheel(viewport as HTMLElement, { deltaX: -96, deltaY: 0 });
    expect(position).toHaveTextContent("02 / 03");
  });

  it("passes canonical image media into cart adds when available", async () => {
    const user = userEvent.setup();
    const cartMedia = {
      kind: "image" as const,
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/treat-03-pdrn-5-ampoule/primary/hash.webp",
      alt: "TREAT PDRN ampoule",
      width: 1400,
      height: 1867,
      role: "cart" as const,
      sortOrder: 5,
      paletteId: null,
      palette: null,
    };
    render(
      <ProductDetail
        product={makeProduct({
          media: [cartMedia],
          cardMedia: cartMedia,
          cartMedia,
          detailMedia: cartMedia,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Add to cart/ }));

    expect(cartMock.add).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: cartMedia.url,
        imageAlt: cartMedia.alt,
        placeholderMedia: null,
      }),
    );
  });

  it("fails honestly when key ingredients or full INCI are unavailable", async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        product={makeProduct({
          keyIngredients: [],
          ingredients: null,
          productDetails: {
            sourceFullInci: "Full INCI unavailable in public product copy.",
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /KEY INGREDIENTS/ }));

    expect(
      screen.getByText(/key ingredient notes are not available/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "FULL INGREDIENTS LIST" }),
    ).not.toBeInTheDocument();
    expect(document.getElementById("full-ingredients")).not.toBeInTheDocument();
  });

  it("renders the product-specific response meter without verified-buyer claims", () => {
    render(<ProductDetail product={makeProduct()} />);

    expect(
      screen.getByText("How refreshed did your skin look?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("meter", {
        name: /How refreshed did your skin look\?: 87 out of 100/,
      }),
    ).toHaveAttribute("value", "87");
    expect(screen.queryByText(/Verified Buyer/i)).not.toBeInTheDocument();
  });

  it("keeps selected server product pricing in sync with main messaging and sticky controls", async () => {
    const user = userEvent.setup();
    const base = makeProduct();
    const secondVariant = {
      ...base.variants[0],
      id: "30ml",
      label: "30 mL",
      price: 4200,
      volume: "30 mL",
      optionValues: { size: "30 mL" },
      sortOrder: 1,
    };
    render(
      <ProductDetail
        product={makeProduct({ variants: [...base.variants, secondVariant] })}
        stripePublishableKey="pk_test_product"
      />,
    );

    const initialMessage = screen.getByTestId("afterpay-messaging-boundary");
    const initialAdd = screen.getByRole("button", {
      name: "Add to cart — $25.00",
    });
    expect(initialMessage).toHaveAttribute("data-amount", "2500");
    expect(initialMessage).toHaveAttribute("data-currency", "USD");
    expect(before(initialAdd, initialMessage)).toBe(true);
    expect(document.querySelector(".pdp-sticky-purchase")).not.toContainElement(
      initialMessage,
    );
    expect(screen.getAllByTestId("afterpay-messaging-boundary")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "30 mL" }));

    expect(screen.getByTestId("afterpay-messaging-boundary")).toHaveAttribute(
      "data-amount",
      "4200",
    );
    expect(
      screen.getByRole("button", { name: "Add to cart — $42.00" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(
        ".pdp-sticky-purchase__variants button[aria-pressed='true']",
      ),
    ).toHaveTextContent("30 mL");
  });

  it("does not mount payment messaging for an unavailable product", () => {
    const base = makeProduct();
    render(
      <ProductDetail
        product={makeProduct({
          status: "sold_out",
          variants: base.variants.map((variant) => ({
            ...variant,
            available: false,
            inventoryStatus: "out_of_stock",
          })),
        })}
        stripePublishableKey="pk_test_product"
      />,
    );

    expect(
      screen.queryByTestId("afterpay-messaging-boundary"),
    ).not.toBeInTheDocument();
  });

  it("renders canonical Core profile facts, routine media, and persistent outcomes", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={makeProduct()} />);

    const profile = screen.getByRole("region", {
      name: "A lightweight PDRN SERUM for HYDRATION, smoother-looking texture, and a steadier GLOW.",
    });
    expect(
      within(profile).getByText("Dullness, dehydration, uneven-looking texture"),
    ).toBeInTheDocument();
    expect(
      within(profile).getByText("Lightweight concentrated serum"),
    ).toBeInTheDocument();
    expect(
      within(profile).getByText(
        "All skin types • Morning and night • Step 02 of The Core",
      ),
    ).toBeInTheDocument();

    const play = screen.getByRole("button", {
      name: "Play TREAT routine video",
    });
    expect(play).toBeInTheDocument();
    const foreground = document.querySelector(
      ".pdp-routine-video__foreground",
    );
    expect(foreground).toHaveAttribute("controls");
    expect(foreground).toHaveAttribute("preload", "metadata");
    expect(foreground).not.toHaveAttribute("autoplay");
    expect(foreground).not.toHaveAttribute("loop");

    const hydrates = screen.getByRole("button", { name: "hydrates" });
    const smooths = screen.getByRole("button", { name: "smooths" });
    expect(hydrates).toHaveAttribute("aria-pressed", "true");
    expect(smooths).toHaveAttribute("aria-pressed", "false");

    fireEvent.pointerEnter(smooths);
    fireEvent.pointerLeave(
      screen.getByRole("group", { name: "TREAT outcomes" }),
    );
    expect(smooths).toHaveAttribute("aria-pressed", "true");

    smooths.focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("button", { name: "wakes up the finish" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("button", { name: "wakes up the finish" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves Quick Signals and the current evidence module beyond the Core", () => {
    render(
      <ProductDetail
        product={makeProduct({
          slug: "refine-02-pore-treatment-pads",
          displayName: "REFINE",
          name: "REFINE",
          routineGroup: "beyond_core",
          routineGroupLabel: "Beyond The Core",
          routineStepNumber: null,
          routineStepName: null,
          routineDisplayLabel: "Beyond The Core",
          media: [],
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "QUICK SIGNALS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Endorsed by familiar faces/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "YOUR DAILY TREATMENT THAT:",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders rating-focused review rows without the marketing heading", () => {
    render(<ProductDetail product={makeProduct()} />);

    const reviewSection = screen.getByRole("region", {
      name: "TREAT customer reviews",
    });
    expect(within(reviewSection).getByText("4.5")).toBeInTheDocument();
    expect(
      within(reviewSection).getByText("AVERAGE RATING"),
    ).toBeInTheDocument();
    expect(reviewSection.querySelectorAll(".review-row")).toHaveLength(2);
    expect(
      screen.queryByRole("heading", { name: "EARLY READS" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/public review intake is not open yet/i),
    ).not.toBeInTheDocument();
  });

  it("fails closed without empty Core editorial media shells", () => {
    render(<ProductDetail product={makeProduct({ media: [] })} />);

    expect(
      screen.queryByLabelText("TREAT routine video"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /PDRN SERUM/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Endorsed by familiar faces/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "QUICK SIGNALS" }),
    ).not.toBeInTheDocument();
  });
});
