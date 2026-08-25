import { render, screen, waitFor, within } from "@testing-library/react";
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

describe("SystemIngredientCarousel", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/system");
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
    expect(viewport).toContainElement(controls as HTMLElement);
    expect(viewport).toContainElement(rail as HTMLElement);
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

  it("shows only the direction available at each carousel endpoint", async () => {
    const user = userEvent.setup();
    render(<SystemIngredientCarousel cards={cards} />);

    expect(
      screen.queryByRole("button", { name: "Previous ingredient" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next ingredient" }));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("button", { name: "Next ingredient" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous ingredient" }));
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("button", { name: "Previous ingredient" }),
    ).not.toBeInTheDocument();
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
