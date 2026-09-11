import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdpEffectsSection } from "@/components/product-detail/PdpEffectsSection";

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => motionPreference.reduced,
  };
});

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

const effectNames = [
  "Hydration",
  "Barrier protection",
  "Brightening & clarity",
  "Anti-aging & firmness",
];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  motionPreference.reduced = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

function effectButton(name: string) {
  return screen.getByRole("button", { name });
}

async function properties(name: string) {
  const carousel = await screen.findByRole("region", { name: `${name} properties` }, { timeout: 2500 });
  await waitFor(() => expect(carousel).toBeVisible(), { timeout: 2500 });
  return carousel;
}

describe("PdpEffectsSection", () => {
  it("starts with a neutral hero and four collapsed effects without property content", () => {
    render(<PdpEffectsSection />);

    expect(screen.getByRole("heading", { name: "Four effects. One formula." })).toBeVisible();
    for (const name of effectNames) {
      expect(effectButton(name)).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByRole("region", { name: / properties$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapse effect description" })).not.toBeInTheDocument();
    expect(screen.queryByText("Water binding")).not.toBeInTheDocument();
  });

  it("opens the unchanged effect description and a fully expanded first property", async () => {
    render(<PdpEffectsSection />);
    fireEvent.click(effectButton("Hydration"));

    expect(effectButton("Hydration")).toHaveAttribute("aria-expanded", "true");
    expect(effectButton("Hydration")).toHaveTextContent(
      "Hydration. A deeper sense of hydration. Water-binding ingredients and stress-protection support, brought together for skin that feels comfortably hydrated.",
    );
    const carousel = await properties("Hydration");
    expect(within(carousel).getByRole("heading", { name: "Water binding" })).toBeVisible();
    expect(within(carousel).getByText("Glycerin · Hyaluronic acid · Betaine")).toBeVisible();
    expect(within(carousel).getByText("Humectants attract and hold water, supporting a softer, more supple skin feel.")).toBeVisible();
    expect(within(carousel).queryByRole("heading", { name: "Stress protection" })).not.toBeInTheDocument();
  });

  it("moves between fully expanded properties and bounds both carousel endpoints", async () => {
    const user = userEvent.setup();
    render(<PdpEffectsSection />);
    fireEvent.click(effectButton("Hydration"));
    const carousel = await properties("Hydration");
    const previous = within(carousel).getByRole("button", { name: "Previous property" });
    const next = within(carousel).getByRole("button", { name: "Next property" });

    expect(previous).toBeDisabled();
    fireEvent.click(previous);
    expect(within(carousel).getByRole("heading", { name: "Water binding" })).toBeVisible();
    next.focus();
    await user.keyboard("{Enter}");
    expect(previous).toHaveFocus();
    expect(within(carousel).getByRole("heading", { name: "Stress protection" })).toBeVisible();
    expect(within(carousel).getByText("Ectoin")).toBeVisible();
    expect(within(carousel).getByText("An osmolyte selected to complement hydration and help skin cope with environmental stress.")).toBeVisible();
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(within(carousel).getByRole("heading", { name: "Stress protection" })).toBeVisible();
    expect(within(carousel).queryByRole("heading", { name: "Water binding" })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(next).toHaveFocus();
    expect(previous).toBeDisabled();
    expect(within(carousel).getByRole("heading", { name: "Water binding" })).toBeVisible();
  });

  it("keeps swipe-driven property content accessible and resets the carousel for another effect", async () => {
    render(<PdpEffectsSection />);
    fireEvent.click(effectButton("Brightening & clarity"));
    const carousel = await properties("Brightening & clarity");
    const track = within(carousel).getByRole("article", { name: "1 of 3" }).parentElement;
    if (!track) throw new Error("Expected a scrollable property track.");
    Object.defineProperty(track, "clientWidth", { configurable: true, value: 320 });
    track.scrollLeft = 640;
    fireEvent.scroll(track);

    expect(within(carousel).getByRole("heading", { name: "Oxidative-stress defense" })).toBeVisible();
    expect(within(carousel).queryByRole("heading", { name: "Pigment-pathway support" })).not.toBeInTheDocument();
    expect(within(carousel).getByRole("button", { name: "Next property" })).toBeDisabled();

    fireEvent.click(effectButton("Hydration"));
    const nextCarousel = await properties("Hydration");
    expect(within(nextCarousel).getByRole("heading", { name: "Water binding" })).toBeVisible();
    expect(within(nextCarousel).getByRole("button", { name: "Previous property" })).toBeDisabled();
  });

  it("returns to the neutral hero and restores focus to the effect that was closed", async () => {
    const user = userEvent.setup();
    render(<PdpEffectsSection />);
    await user.click(effectButton("Brightening & clarity"));
    await properties("Brightening & clarity");
    await user.click(screen.getByRole("button", { name: "Collapse effect description" }));

    expect(effectButton("Brightening & clarity")).toHaveFocus();
    for (const name of effectNames) {
      expect(effectButton(name)).toHaveAttribute("aria-expanded", "false");
    }
    await waitFor(() => expect(screen.queryByRole("region", { name: / properties$/ })).not.toBeInTheDocument(), { timeout: 2500 });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Four effects. One formula." })).toBeVisible());
  });

  it("keeps the latest effect after rapid selections during the fade", async () => {
    render(<PdpEffectsSection />);
    fireEvent.click(effectButton("Hydration"));
    fireEvent.click(effectButton("Barrier protection"));
    fireEvent.click(effectButton("Brightening & clarity"));
    fireEvent.click(effectButton("Anti-aging & firmness"));

    const carousel = await properties("Anti-aging & firmness");
    expect(screen.getAllByRole("region", { name: / properties$/ })).toHaveLength(1);
    expect(effectButton("Anti-aging & firmness")).toHaveAttribute("aria-expanded", "true");
    for (const name of effectNames.slice(0, -1)) {
      expect(effectButton(name)).toHaveAttribute("aria-expanded", "false");
    }
    expect(within(carousel).getByRole("heading", { name: "Cellular renewal" })).toBeVisible();
    expect(within(carousel).getByText("A retinoid pathway for the appearance of fine lines and texture. Final selection remains open.")).toBeVisible();
  });

  it("supports keyboard activation through the effect capsules and Escape closing", async () => {
    const user = userEvent.setup();
    render(<PdpEffectsSection />);
    await user.tab();
    expect(effectButton("Hydration")).toHaveFocus();
    await user.keyboard("{Enter}");
    await properties("Hydration");
    for (const [index, name] of effectNames.slice(1).entries()) {
      await user.tab();
      expect(effectButton(name)).toHaveFocus();
      await user.keyboard(index % 2 === 0 ? " " : "{Enter}");
      await properties(name);
    }
    expect(effectButton("Anti-aging & firmness")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(effectButton("Anti-aging & firmness")).toHaveFocus();
    expect(effectButton("Anti-aging & firmness")).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.queryByRole("region", { name: / properties$/ })).not.toBeInTheDocument());
  });

  it("preserves selection, property navigation, and closing with reduced motion", async () => {
    motionPreference.reduced = true;
    render(<PdpEffectsSection />);
    fireEvent.click(effectButton("Hydration"));
    const carousel = await properties("Hydration");
    fireEvent.click(within(carousel).getByRole("button", { name: "Next property" }));
    expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "instant" }));
    expect(within(carousel).getByRole("heading", { name: "Stress protection" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Collapse effect description" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: / properties$/ })).not.toBeInTheDocument());
    expect(effectButton("Hydration")).toHaveFocus();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Four effects. One formula." })).toBeVisible());
  });
});
