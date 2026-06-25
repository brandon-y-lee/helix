import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/useProductSearch", () => ({
  useProductSearch: vi.fn(() => ({
    status: "idle",
    result: null,
    errorMessage: null,
  })),
}));

import { SearchView } from "@/components/SearchView";

describe("search CTA controls", () => {
  it("marks search suggestion CTAs while keeping the clear control compact", async () => {
    const user = userEvent.setup();
    render(<SearchView />);

    expect(screen.getByRole("button", { name: "Cleanser" })).toHaveClass(
      "search-suggestions__button",
    );

    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "serum");
    const clear = screen.getByRole("button", { name: "Clear search" });
    expect(clear).toHaveClass("search-field__clear");
    expect(clear).not.toHaveClass("btn--editorial-rounded");
  });
});
