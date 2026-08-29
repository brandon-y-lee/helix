import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemIngredientCarousel } from "@/components/system/SystemIngredientCarousel";
import type { IngredientIndexCard } from "@/lib/content/system";

const cards: IngredientIndexCard[] = [
  {
    id: "pdrn",
    name: "PDRN / Sodium DNA",
    identity: "Purified DNA fragments.",
    ingredientClass: "Polynucleotide",
    mechanism: "Conditions within water-based formulas.",
    skinRelevance: "Supports a replenished-looking finish.",
    formulationNote: "This must not be rendered.",
    products: [{ slug: "peptide-bounce", displayName: "Peptide Bounce" }],
  },
  {
    id: "niacinamide",
    name: "Niacinamide",
    identity: "The amide form of vitamin B3.",
    ingredientClass: "Vitamin derivative",
    mechanism: "Supports barrier and tone appearance.",
    skinRelevance: "Provides broad cosmetic conditioning.",
    products: [{ slug: "peptide-bounce", displayName: "Peptide Bounce" }],
  },
];

const abbreviatedCards: IngredientIndexCard[] = [
  {
    ...cards[0],
    id: "collagen-source",
    name: "Collagen",
    ingredientClass: "Film-forming family",
  },
  {
    ...cards[1],
    id: "hyaluronic-acid",
    name: "Hyaluronic Acid",
    ingredientClass: "Humectant",
  },
];

describe("SystemIngredientCarousel", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/system");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
  });

  it("presents image-led ingredient tabs with one compact detail disclosure", () => {
    const { container } = render(<SystemIngredientCarousel cards={cards} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(container.querySelectorAll(".ingredient-carousel__image")).toHaveLength(2);
    const viewport = container.querySelector(".ingredient-carousel__viewport");
    const controls = container.querySelector(".ingredient-carousel__controls");
    const rail = container.querySelector(".ingredient-carousel__rail");
    const swipeIndicator = container.querySelector(".carousel-swipe-indicator");
    expect(viewport).toContainElement(controls as HTMLElement);
    expect(viewport).toContainElement(rail as HTMLElement);
    expect(viewport).toContainElement(swipeIndicator as HTMLElement);
    expect(swipeIndicator).toHaveTextContent("SWIPE");
    expect(swipeIndicator).toHaveAttribute("data-visible", "false");
    expect(
      (controls as HTMLElement).compareDocumentPosition(rail as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Previous ingredient" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next ingredient" }),
    ).toBeInTheDocument();

    const panel = screen.getByRole("tabpanel", { name: /PDRN/i });
    expect(panel).toHaveClass("method-selection-panel");
    expect(panel).toHaveClass("ingredient-carousel__panel");
    expect(panel).toHaveAttribute("id", "system-ingredient-pdrn");
    expect(panel).toHaveTextContent("Purified DNA fragments.");
    expect(panel).toHaveTextContent("Conditions within water-based formulas.");
    expect(panel).toHaveTextContent("Supports a replenished-looking finish.");
    expect(panel).not.toHaveTextContent("This must not be rendered.");
    expect(within(panel).getByRole("link", { name: /Peptide Bounce/i })).toHaveAttribute(
      "href",
      "/products/peptide-bounce",
    );
  });

  it("reveals the shared swipe indicator over ingredient cards", async () => {
    const { container } = render(<SystemIngredientCarousel cards={cards} />);
    const viewport = container.querySelector(
      ".ingredient-carousel__viewport",
    ) as HTMLElement;
    const indicator = container.querySelector(
      ".carousel-swipe-indicator",
    ) as HTMLElement;
    viewport.getBoundingClientRect = vi.fn(
      () => ({ left: 20, top: 40, width: 500, height: 400 }) as DOMRect,
    );

    fireEvent.pointerMove(screen.getAllByRole("tab")[0], {
      clientX: 180,
      clientY: 220,
      pointerType: "mouse",
    });
    await waitFor(() => expect(indicator).toHaveAttribute("data-visible", "true"));

    fireEvent.pointerLeave(viewport);
    await waitFor(() => expect(indicator).toHaveAttribute("data-visible", "false"));
  });

  it("uses shortened ingredient labels in cards and expanded details", async () => {
    const user = userEvent.setup();
    render(<SystemIngredientCarousel cards={abbreviatedCards} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent("Film-forming family");
    expect(tabs[0]).toHaveTextContent("Collagen");
    expect(tabs[1]).toHaveTextContent("Hyaluronic Acid");

    const panel = screen.getByRole("tabpanel", { name: /Collagen/i });
    expect(panel).toHaveTextContent("Collagen");
    expect(panel).toHaveTextContent("Film-forming family");
    expect(panel).not.toHaveTextContent("Collagen-source ingredients");

    await user.click(tabs[1]);
    const hyaluronicPanel = screen.getByRole("tabpanel", {
      name: /Hyaluronic Acid/i,
    });
    expect(hyaluronicPanel).toHaveTextContent("Hyaluronic Acid");
    expect(hyaluronicPanel).not.toHaveTextContent("Sodium Hyaluronate");
  });

  it("reveals a selected card and supports roving carousel keyboard controls", async () => {
    const user = userEvent.setup();
    const { container } = render(<SystemIngredientCarousel cards={cards} />);
    const tabs = screen.getAllByRole("tab");
    const viewport = container.querySelector(
      ".ingredient-carousel__viewport",
    ) as HTMLElement;
    const rail = container.querySelector(".ingredient-carousel__rail") as HTMLElement;
    const scrollIntoView = vi.fn();
    tabs[1].scrollIntoView = scrollIntoView;
    viewport.getBoundingClientRect = vi.fn(
      () => ({ left: 0, width: 300 }) as DOMRect,
    );
    tabs[1].getBoundingClientRect = vi.fn(
      () => ({ left: 400, width: 200 }) as DOMRect,
    );

    await user.click(tabs[1]);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(rail).toHaveStyle({ transform: "translate3d(-350px, 0, 0)" }),
    );
    expect(screen.getByRole("tabpanel", { name: /Niacinamide/i })).toHaveTextContent(
      "The amide form of vitamin B3.",
    );
    expect(container.querySelector(".ingredient-carousel")).toHaveAttribute(
      "data-centered-ingredient",
      "niacinamide",
    );

    tabs[1].focus();
    const focusWithoutScroll = vi.spyOn(tabs[0], "focus");
    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
    expect(focusWithoutScroll).toHaveBeenCalledWith({ preventScroll: true });
    await user.keyboard("{ArrowLeft}");
    expect(tabs[1]).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(tabs[1]).toHaveFocus();
  });

  it("moves between carousel endpoints without changing the selected ingredient", async () => {
    const user = userEvent.setup();
    const { container } = render(<SystemIngredientCarousel cards={cards} />);
    const carousel = container.querySelector(".ingredient-carousel");
    const tabs = screen.getAllByRole("tab");

    expect(
      screen.queryByRole("button", { name: "Previous ingredient" }),
    ).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next ingredient" });
    next.focus();
    await user.keyboard("{Enter}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(carousel).toHaveAttribute("data-centered-ingredient", "niacinamide");
    expect(screen.getByRole("tabpanel", { name: /PDRN/i })).toBeVisible();

    act(() => tabs[0].focus());
    await waitFor(() =>
      expect(carousel).toHaveAttribute("data-centered-ingredient", "pdrn"),
    );
    expect(tabs[0]).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Next ingredient" }));
    expect(carousel).toHaveAttribute("data-centered-ingredient", "niacinamide");
    await user.click(tabs[0]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(carousel).toHaveAttribute("data-centered-ingredient", "pdrn");

    await user.click(screen.getByRole("button", { name: "Next ingredient" }));
    expect(
      screen.queryByRole("button", { name: "Next ingredient" }),
    ).not.toBeInTheDocument();
    const previous = screen.getByRole("button", { name: "Previous ingredient" });
    await waitFor(() => expect(previous).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(carousel).toHaveAttribute("data-centered-ingredient", "pdrn");
    expect(
      screen.queryByRole("button", { name: "Previous ingredient" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next ingredient" })).toHaveFocus(),
    );
  });

  it("preserves ingredient deep links and selects their disclosure", async () => {
    window.history.replaceState(null, "", "/system#system-ingredient-niacinamide");
    render(<SystemIngredientCarousel cards={cards} />);

    await waitFor(() =>
      expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByRole("tabpanel", { name: /Niacinamide/i })).toHaveAttribute(
      "id",
      "system-ingredient-niacinamide",
    );
    expect(
      screen.queryByRole("button", { name: "Next ingredient" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous ingredient" }),
    ).toBeInTheDocument();
  });

  it("ignores malformed or unknown ingredient hashes without crashing", () => {
    window.history.replaceState(null, "", "/system#%E0%A4%A");

    expect(() => render(<SystemIngredientCarousel cards={cards} />)).not.toThrow();
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
  });
});
