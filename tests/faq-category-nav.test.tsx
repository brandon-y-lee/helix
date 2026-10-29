import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAQCategoryNav } from "@/components/content/FAQCategoryNav";

const categories = [
  { id: "products", label: "Products" },
  { id: "accounts", label: "Accounts" },
  { id: "shipping", label: "Shipping" },
  { id: "policies", label: "Policies" },
];
let tops: Record<string, number>;
let notifyResize: () => void;
let resolveFonts: () => void;
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

function mount() {
  render(
    <div>
      <FAQCategoryNav categories={categories} />
      <div className="faq-categories">
        {categories.map(({ id }) => <section key={id} id={id} />)}
      </div>
    </div>,
  );
}

function nextFrame() {
  act(() => vi.advanceTimersToNextFrame());
}

function expectCurrent(label: string) {
  expect(screen.getByRole("link", { name: label }))
    .toHaveAttribute("aria-current", "location");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  vi.stubGlobal("scrollY", 100);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { notifyResize = callback; }
    observe() {}
    disconnect() {}
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: new Promise<void>((resolve) => { resolveFonts = resolve; }) },
  });
  tops = { products: 80, accounts: 300, shipping: 600, policies: 900 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, tops[this.id] ?? 0, 300, 72);
    });
  window.history.replaceState(null, "", "/faq#policies");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
  window.history.replaceState(null, "", "/");
});

describe("FAQ category navigation", () => {
  it("keeps the fragment through layout-only updates, then follows actual scrolling and resizing", async () => {
    mount();
    expectCurrent("Policies");
    // Native restoration can still be pending when layout callbacks run.
    await act(async () => { notifyResize(); resolveFonts(); });
    nextFrame();
    fireEvent.scroll(window); // A notification without vertical movement.
    nextFrame();
    expectCurrent("Policies");

    tops.accounts = 80;
    act(() => { vi.stubGlobal("scrollY", 300); fireEvent.scroll(window); });
    nextFrame();
    expectCurrent("Accounts");
    expect(window.location.hash).toBe("#policies");

    tops.policies = 80;
    act(() => notifyResize());
    nextFrame();
    expectCurrent("Policies");
  });

  it("discards a queued old measurement when fragment history changes", () => {
    tops.policies = 80;
    mount();
    nextFrame();
    tops.policies = 900;
    tops.accounts = 80;
    act(() => { vi.stubGlobal("scrollY", 300); fireEvent.scroll(window); });
    window.history.replaceState(null, "", "/faq#shipping");
    fireEvent.popState(window);
    act(() => notifyResize());
    nextFrame();
    expectCurrent("Shipping");
  });

  it("uses viewport geometry on initial layout when there is no category fragment", () => {
    window.history.replaceState(null, "", "/faq");
    tops.accounts = 80;
    mount();
    act(() => notifyResize());
    nextFrame();
    expectCurrent("Accounts");
  });
});
