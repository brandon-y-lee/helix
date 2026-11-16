import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchView } from "@/components/search/SearchView";

const { searchForHits } = vi.hoisted(() => ({
  searchForHits: vi.fn(),
}));

vi.mock("algoliasearch/lite", () => ({
  liteClient: vi.fn(() => ({ searchForHits })),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  searchForHits.mockReset();
});

describe("customer product search", () => {
  it("offers collection browsing when search is unavailable without exposing setup instructions", () => {
    vi.stubEnv("NEXT_PUBLIC_ALGOLIA_APP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_ALGOLIA_INDEX_NAME", "");

    render(<SearchView />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Search is temporarily unavailable. You can still browse the collection.",
    );
    expect(screen.getByRole("link", { name: "Browse the collection" })).toHaveAttribute(
      "href",
      "/collections/shop",
    );
    expect(screen.queryByText(/NEXT_PUBLIC|environment variables/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("retries the current query after a provider failure without displaying provider details", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALGOLIA_APP_ID", "test-app");
    vi.stubEnv("NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY", "test-search-key");
    vi.stubEnv("NEXT_PUBLIC_ALGOLIA_INDEX_NAME", "helix_products");
    searchForHits.mockRejectedValueOnce(new Error("Provider response: invalid test-search-key"));
    searchForHits.mockResolvedValueOnce({ results: [{ hits: [], nbHits: 0 }] });

    render(<SearchView />);
    const input = screen.getByRole("searchbox", { name: "Search products" });
    fireEvent.change(input, { target: { value: "serum" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Search is temporarily unavailable. Please try again.",
    );
    expect(screen.queryByText(/invalid test-search-key/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("status", { name: "Searching" })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(await screen.findByText(/No products match.*serum/)).toBeInTheDocument();
    expect(input).toHaveValue("serum");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
