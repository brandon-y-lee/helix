import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/search/SearchView", () => ({
  SearchView: ({ autoFocus }: { autoFocus?: boolean }) => (
    <input aria-label="Search products" autoFocus={autoFocus} />
  ),
}));

import { SearchOverlay } from "@/components/search/SearchOverlay";

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
  it("is a named modal drawer and Escape restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Search" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Search" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByLabelText("Search products")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    expect(document.querySelector(".search-sheet")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await waitFor(() => {
      expect(document.querySelector(".search-sheet")).toBeNull();
      expect(trigger).toHaveFocus();
    });
  });

  it("traps focus and closes when its backdrop is pressed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Search" }));

    const dialog = screen.getByRole("dialog", { name: "Search" });
    const close = screen.getByRole("button", { name: "Close" });
    const input = screen.getByLabelText("Search products");
    expect(input).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).toHaveFocus();

    await user.pointer({ keys: "[MouseLeft]", target: dialog });
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".search-sheet")).toBeNull();
    });
  });
});
