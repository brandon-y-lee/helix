import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdpEducationFocus } from "@/components/product-detail/PdpEducationFocus";

function renderEducation(presentation = "mobile-pilot") {
  const result = render(
    <main data-pdp-presentation={presentation}>
      <PdpEducationFocus />
      <div className="pdp-sections">
        <button type="button">Next application step</button>
        <button type="button">Close ingredients</button>
      </div>
      <button type="button">Product purchase</button>
      <div className="pdp-sticky-purchase" data-visible="true" data-testid="sticky-purchase" />
    </main>,
  );
  vi.stubGlobal("innerHeight", 800);
  vi.spyOn(screen.getByTestId("sticky-purchase"), "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 728, 390, 72),
  );
  return result;
}

async function afterResize() {
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
}

afterEach(() => {
  document.body.removeAttribute("data-sheet-scroll-lock");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PdpEducationFocus", () => {
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

  it("measures current focus after responsive handoff and coalesces resize events", async () => {
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderEducation();
    const next = screen.getByRole("button", { name: "Next application step" });
    const close = screen.getByRole("button", { name: "Close ingredients" });
    vi.spyOn(next, "getBoundingClientRect").mockReturnValue(new DOMRect(20, -2625, 48, 48));
    vi.spyOn(close, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 900, 48, 48));
    next.focus();
    fireEvent.resize(window);
    fireEvent.resize(window);
    fireEvent.resize(window);
    window.requestAnimationFrame(() => close.focus());

    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 228, behavior: "instant" }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(close).toHaveFocus();
  });

  it.each(["body", "purchase", "other-product", "inert", "aria-hidden", "modal", "scroll-lock", "css-hidden"])(
    "leaves %s focus alone during resize",
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
    fireEvent.resize(window);
    await afterResize();
    expect(scroll).not.toHaveBeenCalled();
    expect(control).toHaveFocus();
  });
});
