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
    products: [{ slug: "super-serum", displayName: "Super Serum" }],
  },
  {
    id: "niacinamide",
    name: "Niacinamide",
    identity: "The amide form of vitamin B3.",
    ingredientClass: "Vitamin derivative",
    mechanism: "Supports barrier and tone appearance.",
    skinRelevance: "Provides broad cosmetic conditioning.",
    products: [{ slug: "super-serum", displayName: "Super Serum" }],
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
    expect(panel).toHaveClass("system-selection-panel");
    expect(panel).toHaveClass("ingredient-carousel__panel");
    expect(panel).toHaveAttribute("id", "system-ingredient-pdrn");
    expect(panel).toHaveTextContent("Purified DNA fragments.");
    expect(panel).toHaveTextContent("Conditions within water-based formulas.");
    expect(panel).toHaveTextContent("Supports a replenished-looking finish.");
    expect(panel).not.toHaveTextContent("This must not be rendered.");
    expect(within(panel).getByRole("link", { name: /Super Serum/i })).toHaveAttribute(
      "href",
      "/products/super-serum",
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
    expect(within(tabs[0]).getByText("Selected", { exact: true })).toBeVisible();
    expect(within(tabs[1]).getByText("View details", { exact: true })).toBeVisible();
    expect(screen.getByRole("heading", {
      name: "Selected ingredient: PDRN / Sodium DNA",
    })).toBeVisible();
    next.focus();
    await user.keyboard("{Enter}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(carousel).toHaveAttribute("data-centered-ingredient", "niacinamide");
    expect(screen.getByRole("tabpanel", { name: /PDRN/i })).toBeVisible();
    expect(screen.getByRole("heading", {
      name: "Selected ingredient: PDRN / Sodium DNA",
    })).toBeVisible();

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

  it("waits for a pointer click before centering and selecting its card", () => {
    const { container } = render(<SystemIngredientCarousel cards={cards} />);
    const carousel = container.querySelector(".ingredient-carousel");
    const viewport = container.querySelector(
      ".ingredient-carousel__viewport",
    ) as HTMLElement;
    const tabs = screen.getAllByRole("tab");

    fireEvent.pointerDown(tabs[1], {
      button: 0,
      clientX: 240,
      clientY: 120,
      pointerId: 11,
      pointerType: "mouse",
    });
    act(() => tabs[1].focus());
    expect(carousel).toHaveAttribute("data-centered-ingredient", "pdrn");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.pointerUp(viewport, {
      clientX: 240,
      clientY: 120,
      pointerId: 11,
      pointerType: "mouse",
    });
    fireEvent.click(tabs[1]);

    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(carousel).toHaveAttribute(
      "data-centered-ingredient",
      "niacinamide",
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

  it("reveals and centers a changed ingredient hash without stealing focus", () => {
    const { container } = render(<SystemIngredientCarousel cards={cards} />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();

    window.history.replaceState(null, "", "/system#system-ingredient-niacinamide");
    fireEvent(window, new HashChangeEvent("hashchange"));

    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".ingredient-carousel")).toHaveAttribute(
      "data-centered-ingredient", "niacinamide",
    );
    expect(screen.getByRole("tabpanel", { name: /Niacinamide/i })).toBeVisible();
    expect(document.getElementById("system-ingredient-pdrn")).toHaveAttribute("inert");
    expect(tabs[0]).toHaveFocus();

    for (const hash of ["method-ingredients", "system-ingredient-unknown", "%E0%A4%A"]) {
      window.history.replaceState(null, "", `/system#${hash}`);
      fireEvent(window, new HashChangeEvent("hashchange"));
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    }
  });

  it("waits for the requested panel to be visible even when a frame runs before selection commits", () => {
    window.history.replaceState(null, "", "/system#system-ingredient-niacinamide");
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrolled: { id: string; hidden: boolean; inert: boolean }[] = [];
    const scroll = vi.fn(function (this: HTMLElement) {
      scrolled.push({ id: this.id, hidden: this.hidden, inert: this.hasAttribute("inert") });
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    try {
      render(<SystemIngredientCarousel cards={cards} />);
      expect(scrolled).toEqual([{ id: "system-ingredient-niacinamide", hidden: false, inert: false }]);
      expect(scroll).toHaveBeenCalledWith({ block: "start" });
    } finally {
      requestFrame.mockRestore();
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("scrolls only the current disclosed ingredient and cancels obsolete navigation", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    const runFrames = () => act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
    const navigate = (hash: string) => {
      window.history.replaceState(null, "", `/system#${hash}`);
      fireEvent(window, new HashChangeEvent("hashchange"));
    };

    try {
      const { unmount } = render(<SystemIngredientCarousel cards={cards} />);
      const pdrn = document.getElementById("system-ingredient-pdrn")!;
      const niacinamide = document.getElementById("system-ingredient-niacinamide")!;
      const scrollPdrn = vi.fn();
      const scrollNiacinamide = vi.fn(() => expect(niacinamide).toBeVisible());
      pdrn.scrollIntoView = scrollPdrn;
      niacinamide.scrollIntoView = scrollNiacinamide;

      navigate("system-ingredient-niacinamide");
      expect(scrollNiacinamide).not.toHaveBeenCalled();
      runFrames();
      expect(scrollNiacinamide).toHaveBeenCalledWith({ block: "start" });

      navigate("system-ingredient-pdrn");
      navigate("system-ingredient-unknown");
      runFrames();
      expect(scrollPdrn).not.toHaveBeenCalled();

      navigate("system-ingredient-pdrn");
      window.history.replaceState(null, "", "/system#system-ingredient-niacinamide");
      runFrames();
      expect(scrollPdrn).not.toHaveBeenCalled();

      navigate("system-ingredient-pdrn");
      const tabs = screen.getAllByRole("tab");
      fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
      fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
      runFrames();
      expect(scrollPdrn).not.toHaveBeenCalled();

      navigate("system-ingredient-pdrn");
      unmount();
      runFrames();
      expect(scrollPdrn).not.toHaveBeenCalled();
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
    }
  });

  it("recenters the selected ingredient when its hash follows carousel browsing", () => {
    const { container } = render(<SystemIngredientCarousel cards={cards} />);
    fireEvent.click(screen.getByRole("button", { name: "Next ingredient" }));
    const carousel = container.querySelector(".ingredient-carousel");
    expect(carousel).toHaveAttribute("data-centered-ingredient", "niacinamide");
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");

    window.history.replaceState(null, "", "/system#system-ingredient-pdrn");
    fireEvent(window, new HashChangeEvent("hashchange"));

    expect(carousel).toHaveAttribute("data-centered-ingredient", "pdrn");
    expect(screen.getByRole("tabpanel", { name: /PDRN/i })).toBeVisible();
  });
});
