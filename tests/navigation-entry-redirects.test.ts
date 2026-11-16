import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Shop entry navigation", () => {
  it("keeps the Product and Collection entry points directed to Shop", async () => {
    expect(await nextConfig.redirects?.()).toEqual([
      { source: "/collections", destination: "/collections/shop", permanent: true },
      { source: "/products", destination: "/collections/shop", permanent: true },
    ]);
  });
});
