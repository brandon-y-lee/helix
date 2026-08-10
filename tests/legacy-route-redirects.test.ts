import { beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import PrivacyPolicyPage from "../app/privacy-policy/page";
import RefundPolicyPage from "../app/refund-policy/page";
import ReturnsExchangesPage from "../app/returns-exchanges/page";
import ReturnsPage from "../app/returns/page";
import ShippingPolicyPage from "../app/shipping-policy/page";
import ShippingPage from "../app/shipping/page";
import SupportPage from "../app/support/page";
import TermsOfServicePage from "../app/terms-of-service/page";

const navigation = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);

describe("legacy route redirects", () => {
  beforeEach(() => {
    navigation.permanentRedirect.mockReset();
  });

  it.each([
    ["/privacy", PrivacyPolicyPage],
    ["/terms", TermsOfServicePage],
    ["/faq", SupportPage],
    ["/faq#shipping", ShippingPage],
    ["/faq#shipping", ShippingPolicyPage],
    ["/faq#returns", ReturnsPage],
    ["/faq#returns", ReturnsExchangesPage],
    ["/faq#returns", RefundPolicyPage],
  ])("redirects a compatibility page to %s", (destination, Page) => {
    Page();
    expect(navigation.permanentRedirect).toHaveBeenCalledOnce();
    expect(navigation.permanentRedirect).toHaveBeenCalledWith(destination);
  });

  it("keeps canonical collection, product, and System redirects in Next config", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/method",
          destination: "/system",
          permanent: true,
        },
        {
          source: "/collections",
          destination: "/collections/shop",
          permanent: true,
        },
        {
          source: "/products",
          destination: "/collections/shop",
          permanent: true,
        },
        {
          source: "/products/cleanse-01-calming-gel-cleanser",
          destination: "/products/biotic-reset",
          permanent: true,
        },
        {
          source: "/products/treat-03-pdrn-5-ampoule",
          destination: "/products/peptide-bounce",
          permanent: true,
        },
      ]),
    );
    expect(redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/products/reset-01-calming-gel-cleanser",
        }),
        expect.objectContaining({
          source: "/products/recode-03-pdrn-5-ampoule",
        }),
      ]),
    );
  });
});
