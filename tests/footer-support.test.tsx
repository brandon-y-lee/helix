import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FAQAccordion } from "@/components/FAQAccordion";
import { SiteFooter } from "@/components/SiteFooter";
import { footerLinkGroups } from "@/content/footer";
import { accessibilityStatement } from "@/content/legal/accessibility";
import { cookieCategories, cookiePolicy } from "@/content/legal/cookies";
import { privacyChoices } from "@/content/legal/privacy-choices";
import { privacyPolicy } from "@/content/legal/privacy";
import { termsOfService } from "@/content/legal/terms";
import { contactIntakeStatus } from "@/content/support/contact";
import { faqCategories } from "@/content/support/faq";
import {
  FREE_STANDARD_SHIPPING_THRESHOLD_CENTS,
  formatFreeShippingThreshold,
  qualifiesForFreeStandardShipping,
  remainingForFreeStandardShipping,
} from "@/content/support/policy";
import ContactPage from "@/app/contact/page";

function documentText(values: unknown): string {
  return JSON.stringify(values);
}

describe("global footer", () => {
  it("renders truthful link groups and omits unsupported destinations", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(footer).toHaveClass("site-footer--compact");
    expect(screen.getByRole("heading", { name: "MEI PELLE" })).toBeInTheDocument();
    expect(screen.getByText("STAY IN THE SYSTEM.")).toBeInTheDocument();
    expect(screen.getByText("EMAIL UPDATES ARE NOT OPEN")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(String(new Date().getFullYear()))),
    ).toBeInTheDocument();

    expect(footerLinkGroups).toEqual([
      {
        id: "navigate",
        label: "Navigate",
        links: [
          { label: "Shop", href: "/products" },
          { label: "Method", href: "/method" },
          { label: "About", href: "/about" },
          { label: "Account", href: "/account" },
          { label: "Rewards", href: "/rewards" },
        ],
      },
      {
        id: "support",
        label: "Support",
        links: [
          { label: "FAQ", href: "/faq" },
          { label: "Contact", href: "/contact" },
          { label: "Shipping", href: "/faq#shipping" },
          { label: "Returns & Refunds", href: "/faq#returns" },
        ],
      },
      {
        id: "legal",
        label: "Legal",
        links: [
          { label: "Privacy", href: "/privacy" },
          { label: "Terms", href: "/terms" },
          { label: "Accessibility", href: "/accessibility" },
        ],
      },
    ]);

    for (const group of footerLinkGroups) {
      expect(screen.getAllByText(group.label).length).toBeGreaterThan(0);
      for (const link of group.links) {
        expect(screen.getAllByRole("link", { name: link.label }).length).toBeGreaterThan(0);
      }
    }

    expect(screen.getAllByRole("link", { name: /rewards/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /store locator/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^events$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /instagram/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/payment/i)).not.toBeInTheDocument();
  });

  it("toggles mobile groups and opens cookie preferences", async () => {
    const user = userEvent.setup();
    render(<SiteFooter />);

    const mobileGroups = screen.getByLabelText("Footer links");
    const navigate = within(mobileGroups).getByRole("button", { name: /navigate/i });
    expect(navigate).toHaveAttribute("aria-expanded", "false");
    await user.click(navigate);
    expect(navigate).toHaveAttribute("aria-expanded", "true");
    expect(within(mobileGroups).getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/products",
    );

    await user.click(screen.getByRole("button", { name: "Cookie Preferences" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie Preferences" });
    expect(dialog).toHaveTextContent("Essential cookies");
    expect(dialog).toHaveTextContent("Not active");
    await user.click(within(dialog).getByRole("button", { name: /save essential preference/i }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Essential-only preference saved.",
    );
  });
});

describe("legal and support content", () => {
  it("matches actual data practices and avoids unresolved public placeholders", () => {
    const combined = documentText({
      privacyPolicy,
      termsOfService,
      cookiePolicy,
      privacyChoices,
      accessibilityStatement,
    });

    expect(combined).not.toMatch(/\[INSERT|INSERT COMPANY|hello@rhodeskin|afterpay/i);
    expect(combined).not.toMatch(
      /development storefront|development platform|demo|test store|placeholder/i,
    );
    expect(combined).not.toMatch(/mandatory arbitration|class-action waiver|jury-trial waiver/i);
    expect(combined).not.toMatch(/real payments are available|returns are accepted/i);
    expect(combined).toMatch(/sandbox Checkout/i);
    expect(combined).toMatch(/MEI PELLE REWARDS/i);
    expect(combined).toMatch(/does not submit or store messages/i);
    expect(combined).toMatch(/WCAG 2\.2 AA/i);
    expect(privacyPolicy.canonical).toBe("/privacy");
    expect(termsOfService.canonical).toBe("/terms");
  });

  it("documents only current cookie categories", () => {
    expect(cookieCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "Essential", active: true, optional: false }),
        expect.objectContaining({ category: "Analytics", active: false }),
        expect.objectContaining({ category: "Advertising", active: false }),
      ]),
    );
  });

  it("defines and applies the shared free standard shipping threshold", () => {
    expect(FREE_STANDARD_SHIPPING_THRESHOLD_CENTS).toBe(5000);
    expect(formatFreeShippingThreshold()).toBe("$50+");
    expect(qualifiesForFreeStandardShipping(4999)).toBe(false);
    expect(qualifiesForFreeStandardShipping(5000)).toBe(true);
    expect(qualifiesForFreeStandardShipping(7500)).toBe(true);
    expect(qualifiesForFreeStandardShipping(-1)).toBe(false);
    expect(qualifiesForFreeStandardShipping(Number.NaN)).toBe(false);
    expect(remainingForFreeStandardShipping(4999)).toBe(1);
    expect(remainingForFreeStandardShipping(5000)).toBe(0);
  });

  it("renders FAQ categories with canonical anchors and native disclosures", async () => {
    const user = userEvent.setup();
    render(<FAQAccordion categories={faqCategories} />);

    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      "#products",
    );
    expect(screen.getByRole("link", { name: "Shipping" })).toHaveAttribute(
      "href",
      "#shipping",
    );
    expect(screen.getByRole("link", { name: "Returns & Refunds" })).toHaveAttribute(
      "href",
      "#returns",
    );

    const orderSummary = screen.getByText("Can I place an order right now?");
    const orderDetails = orderSummary.closest("details");
    expect(orderDetails).toHaveAttribute("open");
    expect(screen.getByText(/Stripe-hosted Checkout in sandbox mode/i)).toBeInTheDocument();
    await user.click(orderSummary);
    expect(orderDetails).not.toHaveAttribute("open");

    const faqText = document.body.textContent ?? "";
    expect(faqText).toContain("$50+");
    expect(faqText).not.toMatch(
      /development storefront|development platform|demo|test store|placeholder/i,
    );
  });

  it("renders contact routing without a nonfunctional submission form", () => {
    render(<ContactPage />);

    expect(screen.getByRole("heading", { level: 1, name: "CONTACT" })).toBeInTheDocument();
    expect(screen.getByText(contactIntakeStatus.heading)).toBeInTheDocument();
    expect(screen.getByText(/does not include a message form/i)).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send|submit|check message/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/message sent successfully/i)).not.toBeInTheDocument();
  });
});
