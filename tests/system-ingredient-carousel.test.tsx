import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
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

    const panel = screen.getByRole("tabpanel", { name: /PDRN/i });
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
    render(<SystemIngredientCarousel cards={cards} />);
    const tabs = screen.getAllByRole("tab");

    await user.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: /Niacinamide/i })).toHaveTextContent(
      "The amide form of vitamin B3.",
    );

    tabs[1].focus();
    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tabs[1]).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(tabs[1]).toHaveFocus();
  });

  it("wraps previous and next controls", async () => {
    const user = userEvent.setup();
    render(<SystemIngredientCarousel cards={cards} />);

    await user.click(screen.getByRole("button", { name: "Previous ingredient" }));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Next ingredient" }));
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
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
  });

  it("ignores malformed or unknown ingredient hashes without crashing", () => {
    window.history.replaceState(null, "", "/system#%E0%A4%A");

    expect(() => render(<SystemIngredientCarousel cards={cards} />)).not.toThrow();
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
  });
});
