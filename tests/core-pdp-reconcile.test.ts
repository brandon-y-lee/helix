import { describe, expect, it } from "vitest";
import { receiverUrl } from "@/scripts/catalog-reconcile-core-pdp-media";

describe("Core PDP media reconciliation receiver", () => {
  it("allows a local HTTP receiver and normalizes the webhook path", () => {
    expect(receiverUrl("http://127.0.0.1:3010").href).toBe(
      "http://127.0.0.1:3010/api/webhooks/supabase/catalog-search-sync",
    );
    expect(receiverUrl("http://[::1]:3010").hostname).toBe("[::1]");
  });

  it("allows only the configured site origin for a remote HTTPS receiver", () => {
    expect(
      receiverUrl(
        "https://shop.mei-pelle.example/ignored",
        "https://shop.mei-pelle.example",
      ).href,
    ).toBe(
      "https://shop.mei-pelle.example/api/webhooks/supabase/catalog-search-sync",
    );

    expect(() =>
      receiverUrl(
        "https://receiver.example",
        "https://shop.mei-pelle.example",
      ),
    ).toThrow(/must match NEXT_PUBLIC_SITE_URL/);
  });

  it("rejects non-local plaintext receivers", () => {
    expect(() =>
      receiverUrl(
        "http://shop.mei-pelle.example",
        "https://shop.mei-pelle.example",
      ),
    ).toThrow(/must use HTTPS/);
  });
});
