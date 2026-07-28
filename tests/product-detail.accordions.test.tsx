import { render, screen, within } from "@testing-library/react";
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
    const details = screen.getByRole("heading", { name: "DETAILS" });

    expect(before(add, use)).toBe(true);
    expect(before(use, ingredients)).toBe(true);
    expect(before(ingredients, profile)).toBe(true);
    expect(before(profile, outcomes)).toBe(true);
    expect(before(outcomes, application)).toBe(true);
    expect(before(application, inside)).toBe(true);
    expect(before(inside, details)).toBe(true);
  });

  it("uses a single-open collapsible accordion group", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={makeProduct()} />);

    const use = screen.getByRole("button", { name: /HOW TO USE/ });
    const ingredients = screen.getByRole("button", { name: /KEY INGREDIENTS/ });

    await user.click(use);
    expect(use).toHaveAttribute("aria-expanded", "true");

    await user.click(ingredients);
    expect(use).toHaveAttribute("aria-expanded", "false");
    expect(ingredients).toHaveAttribute("aria-expanded", "true");

    await user.click(ingredients);
    expect(ingredients).toHaveAttribute("aria-expanded", "false");
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

  it("deduplicates gallery roles by normalized asset identity", () => {
    const sharedAsset =
      "https://ERASOGMSQPGIIROVUBJH.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/treat/primary/hash.webp";
    const media: Product["media"] = [
      {
        kind: "image",
        url: `${sharedAsset}?width=1400`,
        alt: "TREAT detail",
        width: 1400,
        height: 1867,
        role: "detail",
        sortOrder: 4,
        paletteId: null,
        palette: null,
      },
      {
        kind: "placeholder",
        url: null,
        alt: "TREAT gallery surface one",
        width: null,
        height: null,
        role: "gallery",
        sortOrder: 2,
        paletteId: "gallery-one",
        palette: { start: "#edf4f5", end: "#87a3aa" },
      },
      {
        kind: "placeholder",
        url: null,
        alt: "TREAT gallery surface two",
        width: null,
        height: null,
        role: "gallery",
        sortOrder: 3,
        paletteId: "gallery-two",
        palette: { start: "#87a3aa", end: "#edf4f5" },
      },
      {
        kind: "image",
        url: `${sharedAsset}#card`,
        alt: "TREAT card",
        width: 1400,
        height: 1867,
        role: "card_default",
        sortOrder: 0,
        paletteId: null,
        palette: null,
      },
    ];

    render(<ProductDetail product={makeProduct({ media })} />);

    expect(
      within(screen.getByRole("group", { name: "Product hue views" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "View hue 1 of 3" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: "View hue 4 of 4" }),
    ).not.toBeInTheDocument();
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
