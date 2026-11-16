import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdpEducationFocus } from "@/components/product-detail/PdpEducationFocus";

function renderEducation(presentation = "mobile-pilot") {
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("innerWidth", 390);
  const result = render(
    <main data-pdp-presentation={presentation}>
      <PdpEducationFocus />
      <div className="pdp-sections">
        <button type="button">Next application step</button>
        <button type="button">Close ingredients</button>
        <button type="button">FULL INGREDIENTS LIST</button>
      </div>
      <button type="button">Product purchase</button>
      <div className="pdp-sticky-purchase" data-visible="true" data-testid="sticky-purchase" />
    </main>,
  );
  vi.spyOn(screen.getByTestId("sticky-purchase"), "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 728, 390, 72),
  );
  return result;
}

async function afterResize() {
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 820px)" && window.innerWidth <= 820,
  }));
});

afterEach(() => {
  document.body.removeAttribute("data-sheet-scroll-lock");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PdpEducationFocus", () => {
  it("reveals the restored phone trigger after native scrolling places it behind the header", async () => {
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderEducation();
    vi.stubGlobal("innerHeight", 844);
    vi.mocked(screen.getByTestId("sticky-purchase").getBoundingClientRect).mockReturnValue(
      new DOMRect(0, 771, 390, 73),
    );
    const trigger = screen.getByRole("button", { name: "FULL INGREDIENTS LIST" });
    const bounds = vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
      new DOMRect(20, 240, 173.140625, 48),
    );
    trigger.focus();
    // Captured WebKit geometry after closing the inline list and native focus scrolling.
    window.requestAnimationFrame(() => bounds.mockReturnValue(new DOMRect(20, -0.375, 173.140625, 48)));

    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: -72.375, behavior: "instant" }));
    expect(trigger).toHaveFocus();

    scroll.mockClear();
    bounds.mockReturnValue(new DOMRect(20, 240, 173.140625, 48));
    trigger.blur();
    trigger.focus();
    await afterResize();
    expect(scroll).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("reveals focused education moved by resize and leaves already-visible focus in place", async () => {
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderEducation();
    const next = screen.getByRole("button", { name: "Next application step" });
    const bounds = vi.spyOn(next, "getBoundingClientRect").mockReturnValue(new DOMRect(20, -2625, 48, 48));
    next.focus();

    vi.stubGlobal("innerWidth", 821);
    fireEvent.resize(window);
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: -2697, behavior: "instant" }));
    expect(next).toHaveFocus();

    scroll.mockClear();
    bounds.mockReturnValue(new DOMRect(20, 240, 48, 48));
    vi.stubGlobal("innerWidth", 920);
    fireEvent.resize(window);
    await afterResize();
    expect(scroll).not.toHaveBeenCalled();

    bounds.mockReturnValue(new DOMRect(20, 900, 48, 48));
    vi.stubGlobal("innerWidth", 921);
    fireEvent.resize(window);
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 228, behavior: "instant" }));
    expect(next).toHaveFocus();
  });

  it("keeps the reader in place on height-only resize while preserving width and explicit focus correction", async () => {
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderEducation();
    const next = screen.getByRole("button", { name: "Next application step" });
    const bounds = vi.spyOn(next, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 240, 48, 48));
    next.focus();
    await afterResize();
    scroll.mockClear();

    // The reader has scrolled away, leaving the last activated education control focused.
    bounds.mockReturnValue(new DOMRect(20, -700, 48, 48));
    for (const height of [760, 844]) {
      vi.stubGlobal("innerHeight", height);
      fireEvent.resize(window);
      await afterResize();
      expect(scroll).not.toHaveBeenCalled();
      expect(next).toHaveFocus();
    }

    vi.stubGlobal("innerWidth", 430);
    fireEvent.resize(window);
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: -772, behavior: "instant" }));
    expect(next).toHaveFocus();

    scroll.mockClear();
    next.blur();
    next.focus();
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: -772, behavior: "instant" }));
    expect(next).toHaveFocus();
  });

  it("leaves ordinary desktop focus scrolling to the browser", async () => {
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderEducation();
    vi.stubGlobal("innerWidth", 821);
    const trigger = screen.getByRole("button", { name: "FULL INGREDIENTS LIST" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(20, -0.375, 173.140625, 48));
    trigger.focus();
    await afterResize();
    expect(scroll).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("measures current focus after responsive handoff and coalesces resize events", async () => {
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderEducation();
    const next = screen.getByRole("button", { name: "Next application step" });
    const close = screen.getByRole("button", { name: "Close ingredients" });
    vi.spyOn(next, "getBoundingClientRect").mockReturnValue(new DOMRect(20, -2625, 48, 48));
    vi.spyOn(close, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 900, 48, 48));
    next.focus();
    for (const width of [430, 800, 390]) {
      vi.stubGlobal("innerWidth", width);
      fireEvent.resize(window);
    }
    window.requestAnimationFrame(() => close.focus());

    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 228, behavior: "instant" }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(close).toHaveFocus();
  });

  it.each(["body", "purchase", "other-product", "inert", "aria-hidden", "modal", "scroll-lock", "css-hidden"])(
    "leaves %s focus alone after focus restoration and resize",
    async (surface) => {
      const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
      renderEducation(surface === "other-product" ? "default" : "mobile-pilot");
      const target = surface === "body"
        ? document.body
        : screen.getByRole("button", { name: surface === "purchase" ? "Product purchase" : "Next application step" });
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(20, -2625, 48, 48));
      target.focus();
      const section = target.closest(".pdp-sections");
      if (surface === "inert") section?.setAttribute("inert", "");
      if (surface === "aria-hidden") section?.setAttribute("aria-hidden", "true");
      if (surface === "modal") section?.setAttribute("aria-modal", "true");
      if (surface === "scroll-lock") document.body.setAttribute("data-sheet-scroll-lock", "");
      if (surface === "css-hidden") target.style.visibility = "hidden";

      await afterResize();
      expect(scroll).not.toHaveBeenCalled();
      vi.stubGlobal("innerWidth", 430);
      fireEvent.resize(window);
      await afterResize();
      expect(scroll).not.toHaveBeenCalled();
      expect(target).toHaveFocus();
    },
  );

  it("cancels a pending correction when the education island unmounts", async () => {
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const { unmount } = renderEducation();
    screen.getByRole("button", { name: "Next application step" }).focus();
    vi.stubGlobal("innerWidth", 430);
    fireEvent.resize(window);
    unmount();
    render(
      <main data-pdp-presentation="mobile-pilot">
        <div className="pdp-sections"><button type="button">New page control</button></div>
      </main>,
    );
    const control = screen.getByRole("button", { name: "New page control" });
    vi.spyOn(control, "getBoundingClientRect").mockReturnValue(new DOMRect(20, -2625, 48, 48));
    control.focus();
    await afterResize();
    vi.stubGlobal("innerWidth", 390);
    fireEvent.resize(window);
    await afterResize();
    expect(scroll).not.toHaveBeenCalled();
    expect(control).toHaveFocus();
  });
});
