import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PdpGalleryIsland,
  type PdpGalleryIslandProps,
} from "@/components/product-detail/PdpGalleryIsland";

const items: PdpGalleryIslandProps["items"] = [
  ["bottle", "image"],
  ["texture", "image"],
  ["application", "video"],
].map(([description, kind], index) => ({
  id: description,
  description,
  swatch: ["#eeeeee", "#dddddd"],
  media: {
    kind: kind as "image" | "video",
    url: `/media/${description}.${kind === "video" ? "mp4" : "webp"}`,
    alt: `Serum ${description}`,
    width: 1200,
    height: 1500,
    role: "gallery",
    sortOrder: index,
    paletteId: null,
    palette: null,
  },
}));

function renderGallery(props: Partial<PdpGalleryIslandProps> = {}) {
  return render(
    <PdpGalleryIsland
      productKey="super-serum"
      detailMedia={null}
      items={items}
      presentation="mobile-pilot"
      {...props}
    />,
  );
}

let mobile = true;
const listeners = new Set<() => void>();

function resizeToMobile(value: boolean) {
  act(() => {
    mobile = value;
    for (const listener of listeners) listener();
  });
}

beforeEach(() => {
  mobile = true;
  listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 820px)" ? mobile : true,
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "touch";
    }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Treat mobile gallery", () => {
  it("preserves vertical gestures and cancels interrupted horizontal gestures", () => {
    renderGallery();
    const bottle = screen.getByRole("img", { name: "Serum bottle" });
    const view = screen.getByRole("button", { name: "View bottle, media 1 of 3" });
    fireEvent.pointerDown(bottle, { pointerId: 1, clientX: 300, clientY: 100 });
    expect(fireEvent.pointerMove(bottle, {
      pointerId: 1, clientX: 200, clientY: 400, cancelable: true,
    })).toBe(true);
    fireEvent.pointerUp(bottle, { pointerId: 1, clientX: 200, clientY: 400 });
    expect(view).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerDown(bottle, { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(bottle, { pointerId: 2, clientX: 100, clientY: 110 });
    fireEvent.pointerCancel(bottle, { pointerId: 2, clientX: 100, clientY: 110 });
    expect(view).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an honest visible unavailable message when no media exists", () => {
    renderGallery({ items: [] });
    expect(screen.getByRole("status")).toHaveTextContent("Product images are not available yet.");
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not suggest navigation when there is only one view", () => {
    resizeToMobile(false);
    renderGallery({ items: [items[0]] });
    screen.getByRole("button", { name: "View bottle, media 1 of 1" }).focus();
    resizeToMobile(true);
    expect(screen.queryByRole("group", { name: "Product media views" })).not.toBeInTheDocument();
    const gallery = screen.getByRole("group", { name: "Product gallery" });
    expect(gallery).toHaveFocus();
    fireEvent.keyDown(gallery, { key: "End" });
    expect(gallery).toHaveFocus();
    const bottle = screen.getByRole("img", { name: "Serum bottle" });
    fireEvent.pointerDown(bottle, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(bottle, { pointerId: 1, clientX: 100, clientY: 110 });
    fireEvent.pointerUp(bottle, { pointerId: 1, clientX: 100, clientY: 110 });
    expect(bottle.closest("[inert]")).toBeNull();
  });

  it("loads one video, exposes controls only when active, and pauses it on selection changes", () => {
    const { container } = renderGallery();
    expect(container.querySelectorAll("video")).toHaveLength(1);
    const video = container.querySelector("video")!;
    const pause = vi.spyOn(video, "pause");
    expect(video).toHaveAttribute("tabindex", "-1");
    expect(video).not.toHaveAttribute("controls");
    expect(video.closest("[inert]")).not.toBeNull();
    fireEvent.play(video);
    expect(pause).toHaveBeenCalled();

    const application = screen.getByRole("button", { name: "View application, media 3 of 3" });
    fireEvent.click(application);
    expect(video).toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("tabindex", "-1");
    expect(video.closest("[inert]")).toBeNull();
    fireEvent.keyDown(video, { key: "ArrowLeft" });
    fireEvent.pointerDown(video, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(video, { pointerId: 1, clientX: 300, clientY: 110 });
    fireEvent.pointerUp(video, { pointerId: 1, clientX: 300, clientY: 110 });
    expect(application).toHaveAttribute("aria-pressed", "true");

    pause.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "View texture, media 2 of 3" }));
    expect(pause).toHaveBeenCalled();
    expect(video).toHaveAttribute("tabindex", "-1");
    expect(video).not.toHaveAttribute("controls");
    expect(video.closest("[inert]")).not.toBeNull();
  });

  it("cancels an unfinished swipe on resize while preserving selection and focused controls", () => {
    renderGallery();
    const views = screen.getAllByRole("button");
    fireEvent.click(views[1]);
    views[1].focus();
    const texture = screen.getByRole("img", { name: "Serum texture" });
    fireEvent.pointerDown(texture, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(texture, { pointerId: 1, clientX: 100, clientY: 110 });
    resizeToMobile(false);
    fireEvent.pointerUp(texture, { pointerId: 1, clientX: 100, clientY: 110 });

    expect(views[1]).toHaveAttribute("aria-pressed", "true");
    expect(views[1]).toHaveFocus();
    resizeToMobile(true);
    expect(screen.getByRole("img", { name: "Serum texture" })).toBe(texture);
    expect(views[1]).toHaveAttribute("aria-pressed", "true");
    expect(views[1]).toHaveFocus();
  });

  it("pauses a retained video when refreshed gallery media resets selection", () => {
    const { container, rerender } = renderGallery();
    const video = container.querySelector("video")!;
    fireEvent.click(screen.getByRole("button", { name: "View application, media 3 of 3" }));
    const pause = vi.spyOn(video, "pause");
    pause.mockClear();
    rerender(<PdpGalleryIsland productKey="super-serum" detailMedia={null} presentation="mobile-pilot" items={[...items, { ...items[0], id: "additional-bottle" }]} />);
    expect(container.querySelector("video")).toBe(video);
    expect(screen.getByRole("button", { name: "View bottle, media 1 of 4" })).toHaveAttribute("aria-pressed", "true");
    expect(pause).toHaveBeenCalled();
    expect(video.closest("[inert]")).not.toBeNull();
  });

  it("cancels a swipe when the mobile width changes without crossing the breakpoint", () => {
    vi.stubGlobal("innerWidth", 390);
    renderGallery();
    const bottle = screen.getByRole("img", { name: "Serum bottle" });
    const first = screen.getByRole("button", { name: "View bottle, media 1 of 3" });
    first.focus();
    fireEvent.pointerDown(bottle, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(bottle, { pointerId: 1, clientX: 180, clientY: 110 });
    vi.stubGlobal("innerWidth", 430);
    fireEvent.resize(window);
    fireEvent.pointerUp(bottle, { pointerId: 1, clientX: 180, clientY: 110 });
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveFocus();
  });

  it("moves at most one view per horizontal swipe and stops at both ends", () => {
    renderGallery();
    const views = screen.getAllByRole("button");
    const bottle = screen.getByRole("img", { name: "Serum bottle" });
    const swipe = (target: Element, start: number, end: number) => {
      fireEvent.pointerDown(target, { pointerId: 1, clientX: start, clientY: 100 });
      fireEvent.pointerMove(target, { pointerId: 1, clientX: end, clientY: 110 });
      fireEvent.pointerUp(target, { pointerId: 1, clientX: end, clientY: 110 });
    };
    swipe(bottle, 300, 800);
    expect(views[0]).toHaveAttribute("aria-pressed", "true");
    swipe(bottle, 300, -700);
    expect(views[1]).toHaveAttribute("aria-pressed", "true");
    swipe(screen.getByRole("img", { name: "Serum texture" }), 300, -700);
    expect(views[2]).toHaveAttribute("aria-pressed", "true");
    const activeSlide = screen.getByLabelText("Serum application").parentElement!;
    swipe(activeSlide, 300, -700);
    expect(views[2]).toHaveAttribute("aria-pressed", "true");
  });

  it("supports bounded Arrow, Home and End selection with visible control focus", () => {
    renderGallery();
    const views = within(screen.getByRole("group", { name: "Product media views" }))
      .getAllByRole("button");
    const gallery = screen.getByRole("group", { name: "Product gallery" });
    gallery.focus();

    fireEvent.keyDown(gallery, { key: "ArrowRight" });
    expect(views[1]).toHaveAttribute("aria-pressed", "true");
    expect(views[1]).toHaveFocus();

    fireEvent.keyDown(views[1], { key: "End" });
    expect(views[2]).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(views[2], { key: "ArrowRight" });
    expect(views[2]).toHaveAttribute("aria-pressed", "true");
    expect(views[2]).toHaveFocus();

    fireEvent.keyDown(views[2], { key: "Home" });
    fireEvent.keyDown(views[0], { key: "ArrowLeft" });
    expect(views[0]).toHaveAttribute("aria-pressed", "true");
    expect(views[0]).toHaveFocus();
  });
});
