import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FAQAccordion } from "@/components/content/FAQAccordion";
import { SiteFooter } from "@/components/shell/SiteFooter";
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
    expect(screen.getByRole("heading", { name: "Mei Pelle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mei Pelle" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Stay in the system.")).toBeInTheDocument();
    expect(screen.getByText("Email updates are not open")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();

    for (const [name, href] of [
      ["Shop", "/products"],
      ["System", "/system"],
      ["Rewards", "/rewards"],
      ["FAQ", "/faq"],
      ["Contact", "/contact"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ] as const) {
      expect(within(footer).getAllByRole("link", { name })[0]).toHaveAttribute(
        "href",
        href,
      );
    }

    expect(screen.queryByRole("link", { name: /store locator/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^events$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /instagram/i })).not.toBeInTheDocument();
  });

  it("toggles mobile groups and opens cookie preferences", async () => {
    const user = userEvent.setup();
    render(<SiteFooter />);

    const mobileGroups = screen.getByLabelText("Footer links");
    const navigate = within(mobileGroups).getByText("Navigate");
    const navigateDetails = navigate.closest("details");
    expect(navigateDetails).not.toHaveAttribute("open");
    await user.click(navigate);
    expect(navigateDetails).toHaveAttribute("open");
    expect(within(mobileGroups).getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/products",
    );

    await user.click(screen.getByRole("button", { name: "Cookie Preferences" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie Preferences" });
    expect(dialog).toHaveTextContent("Essential cookies");
    expect(dialog).toHaveTextContent("Payment messaging");
    expect(dialog).toHaveTextContent("Active when eligible");
    await user.click(within(dialog).getByRole("button", { name: /save current preference/i }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Current preference saved.",
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
        expect.objectContaining({ category: "Functional", active: true, optional: false }),
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
