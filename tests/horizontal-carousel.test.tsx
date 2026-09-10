import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HorizontalCarousel } from "@/components/carousel/HorizontalCarousel";

function renderRail() {
  const result = render(
    <HorizontalCarousel
      ariaLabel="Ingredient discovery"
      itemName="ingredient"
      items={["PDRN", "Peptides", "Niacinamide"].map((name) => ({
        key: name,
        label: name,
        content: <li key={name} className="home-beyond-carousel__card"><a href={`#${name}`}>{name}</a></li>,
      }))}
    />,
  );
  const rail = screen.getByRole("region", { name: "Ingredient discovery" });
  const viewport = result.container.querySelector(".home-beyond-carousel__viewport") as HTMLElement;
  const track = screen.getByRole("list");
  const cards = screen.getAllByRole("listitem");
  let viewportWidth = 300;
  Object.defineProperty(viewport, "clientWidth", { configurable: true, get: () => viewportWidth });
  Object.defineProperty(track, "scrollWidth", { configurable: true, value: 900 });
  viewport.getBoundingClientRect = () => ({ left: 0, right: viewportWidth, width: viewportWidth }) as DOMRect;
  cards.forEach((card, index) => {
    card.getBoundingClientRect = () => {
      const left = index * 300 - Number(rail.dataset.activeIndex) * 300;
      return { left, right: left + 300, width: 300 } as DOMRect;
    };
  });
  fireEvent(window, new Event("resize"));
  return { rail, viewport, resize: (width: number) => {
    viewportWidth = width;
    fireEvent(window, new Event("resize"));
  } };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shared horizontal discovery", () => {
  it("reveals a product or ingredient reached by keyboard focus instead of leaving focus offscreen", () => {
    const { rail } = renderRail();
    act(() => screen.getByRole("link", { name: "Niacinamide" }).focus());
    expect(rail).toHaveAttribute("data-active-index", "2");
    expect(screen.getByRole("link", { name: "Niacinamide" })).toHaveFocus();
  });

  it("announces finite progress and restores focus when an endpoint or wider layout removes a control", () => {
    vi.useFakeTimers();
    const { rail, resize } = renderRail();
    expect(screen.queryByRole("button", { name: "Previous ingredient" })).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next ingredient" });
    act(() => next.focus());
    fireEvent.click(next);
    expect(rail.querySelector("[aria-live]"))
      .toHaveTextContent("2 of 3: Peptides leads Ingredient discovery.");
    act(() => vi.advanceTimersByTime(250));
    fireEvent.click(next);
    expect(rail.querySelector("[aria-live]"))
      .toHaveTextContent("3 of 3: Niacinamide leads Ingredient discovery.");
    expect(screen.queryByRole("button", { name: "Next ingredient" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous ingredient" })).toHaveFocus();
    resize(900);
    expect(screen.queryByRole("button", { name: "Previous ingredient" })).not.toBeInTheDocument();
    expect(rail).toHaveFocus();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("leaves vertical gestures to page scrolling and commits at most one item for a horizontal gesture", () => {
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? "touch";
      }
    });
    const { rail, viewport } = renderRail();
    const down = { pointerId: 1, pointerType: "touch", clientX: 260, clientY: 100 };
    fireEvent.pointerDown(viewport, down);
    const vertical = new PointerEvent("pointermove", {
      ...down, clientX: 250, clientY: 250, bubbles: true, cancelable: true,
    });
    fireEvent(viewport, vertical);
    fireEvent.pointerUp(viewport, { ...down, clientX: 250, clientY: 250 });
    expect(vertical.defaultPrevented).toBe(false);
    expect(rail).toHaveAttribute("data-active-index", "0");

    fireEvent.pointerDown(viewport, down);
    fireEvent.pointerMove(viewport, { ...down, clientX: -400, clientY: 110 });
    fireEvent.pointerUp(viewport, { ...down, clientX: -400, clientY: 110 });
    expect(rail).toHaveAttribute("data-active-index", "1");
  });
});
