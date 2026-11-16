import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PERSISTENT_SHEET_MOTION_TRANSITION } from "@/components/overlays/Sheet";
import { SearchOverlay } from "@/components/search/SearchOverlay";

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => motionPreference.reduced,
  };
});

vi.mock("@/components/search/useProductSearch", () => ({
  useProductSearch: () => ({
    status: "idle",
    result: null,
    errorMessage: null,
  }),
}));

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.style.removeProperty("--sheet-scrollbar-width");
  document.body.removeAttribute("data-sheet-scroll-lock");
  motionPreference.reduced = false;
  vi.restoreAllMocks();
});

function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Search
      </button>
      <SearchOverlay
        open={open}
        onClose={() => setOpen(false)}
        returnFocus={() => triggerRef.current?.focus()}
      />
    </>
  );
}

describe("SearchOverlay", () => {
  it("focuses its search input after the opening layer becomes interactive", async () => {
    const user = userEvent.setup();
    const nativeFocus = HTMLElement.prototype.focus;
    // jsdom does not enforce the browser's inert focus boundary.
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      if (this.closest("[inert]")) return;
      nativeFocus.call(this, options);
    });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByLabelText("Search products")).toHaveFocus());
  });

  it("keeps one closed Motion drawer mounted and opens the same node", async () => {
    const user = userEvent.setup();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(<Harness />);

    const panel = document.querySelector(".search-sheet");
    const overlay = panel?.parentElement;
    expect(overlay).toHaveAttribute("data-motion-sheet");
    expect(overlay).toHaveAttribute("data-state", "closed");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("inert");
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(panel).toHaveStyle({
      transform: "translate3d(100%, 0, 0)",
    });
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Search" }));

    const dialog = screen.getByRole("dialog", { name: "Search" });
    expect(dialog).toBe(overlay);
    expect(dialog).toHaveAccessibleDescription(
      "Search the helix product catalog.",
    );
    expect(document.querySelector(".search-sheet")).toBe(panel);
    expect(overlay).toHaveAttribute("data-state", "open");
    expect(overlay).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAttribute("data-state", "open");
    expect(document.querySelectorAll(".search-sheet")).toHaveLength(1);
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    await waitFor(() => {
      expect(screen.getByLabelText("Search products")).toHaveFocus();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });
    expect(PERSISTENT_SHEET_MOTION_TRANSITION).toEqual({
      duration: 0.3,
      ease: [0.42, 0, 0.58, 1],
      backdropDuration: 0.14,
    });
  });

  it("preserves the query and restores trigger focus after reduced-motion close", async () => {
    motionPreference.reduced = true;
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Search" });

    await user.click(trigger);
    const input = screen.getByLabelText("Search products");
    const panel = document.querySelector(".search-sheet");
    const overlay = panel?.parentElement;
    await user.type(input, "serum");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
    expect(overlay).toHaveAttribute("data-state", "closed");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("inert");
    expect(document.querySelector(".search-sheet")).toBe(panel);

    await waitFor(() => {
      expect(document.body).not.toHaveStyle({ overflow: "hidden" });
      expect(trigger).toHaveFocus();
    });

    await user.click(trigger);
    expect(document.querySelector(".search-sheet")).toBe(panel);
    expect(screen.getByLabelText("Search products")).toHaveValue("serum");
    await waitFor(() => {
      expect(screen.getByLabelText("Search products")).toHaveFocus();
    });
  });

  it("traps focus and closes when its backdrop is pressed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Search" }));

    const dialog = screen.getByRole("dialog", { name: "Search" });
    const close = screen.getByRole("button", { name: "Close" });
    const lastSuggestion = screen.getByRole("button", {
      name: "Daily protection",
    });
    lastSuggestion.focus();

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastSuggestion).toHaveFocus();

    await user.pointer({ keys: "[MouseLeft]", target: dialog });
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
    await waitFor(() => {
      expect(dialog).toHaveAttribute("data-state", "closed");
      expect(dialog).toHaveAttribute("aria-hidden", "true");
      expect(document.querySelectorAll(".search-sheet")).toHaveLength(1);
      expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    });
  });
});
