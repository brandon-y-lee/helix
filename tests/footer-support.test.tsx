import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FAQAccordion } from "@/components/content/FAQAccordion";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
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
import PrivacyChoicesPage from "@/app/privacy-choices/page";
import { metadata as accessibilityMetadata } from "@/app/accessibility/page";
import { metadata as contactMetadata } from "@/app/contact/page";
import { metadata as cookiePolicyMetadata } from "@/app/cookie-policy/page";
import { metadata as faqMetadata } from "@/app/faq/page";
import { metadata as privacyChoicesMetadata } from "@/app/privacy-choices/page";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import { metadata as termsMetadata } from "@/app/terms/page";
import {
  COOKIE_ACKNOWLEDGEMENT_COOKIE,
  GUEST_CART_COOKIE,
  PENDING_CHECKOUT_COOKIE,
  REFERRAL_COOKIE,
} from "@/lib/customer-state-identifiers";

function documentText(values: unknown): string {
  return JSON.stringify(values);
}

describe("global footer", () => {
  it("renders truthful link groups and omits unsupported destinations", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(footer).toHaveTextContent(/© \d{4}\. All rights reserved\./);
    expect(footer).not.toHaveTextContent(/© \d{4} helix/i);
    expect(footer).not.toHaveTextContent(/Mei Pelle/i);
    const identityLink = screen.getByRole("link", { name: "helix" });
    expect(screen.getByRole("heading", { name: "helix" })).toBeInTheDocument();
    expect(identityLink).toHaveAttribute("href", "/");
    expect(
      identityLink.querySelector('[data-helix-identity="wordmark"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(identityLink).not.toHaveTextContent(/Mei Pelle|helix/);
    expect(screen.queryByText("Stay in the system.")).not.toBeInTheDocument();
    expect(screen.queryByText("Email updates are not open")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();

    for (const [name, href] of [
      ["Shop", "/collections/shop"],
      ["System", "/system"],
      ["helix rewards", "/rewards"],
      ["Account overview", "/account"],
      ["Sign in", "/account/sign-in"],
      ["Create account", "/account/sign-up"],
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

    const desktopNav = within(footer).getByRole("navigation", {
      name: "Footer navigation",
    });
    const navigateGroup = within(desktopNav).getByRole("region", {
      name: "Navigate",
    });
    const accountGroup = within(desktopNav).getByRole("region", {
      name: "Account",
    });
    expect(within(navigateGroup).queryByRole("link", { name: "Account overview" }))
      .not.toBeInTheDocument();
    expect(within(navigateGroup).queryByRole("link", { name: "Rewards" }))
      .not.toBeInTheDocument();
    expect(within(accountGroup).getByRole("link", { name: "Account overview" }))
      .toHaveAttribute("href", "/account");
    expect(within(accountGroup).getByRole("link", { name: "helix rewards" }))
      .toHaveAttribute("href", "/rewards");

    const serviceLinks = within(footer).getByRole("complementary", {
      name: "Footer service links",
    });
    expect(
      within(serviceLinks).getByRole("link", {
        name: "Contact status: Support Intake unavailable",
      }),
    ).toHaveAttribute("href", "/contact");
    expect(
      within(serviceLinks).getByRole("link", {
        name: "Shipping & returns: Review current policy status",
      }),
    ).toHaveAttribute("href", "/faq");

    const reviews = within(footer).getByRole("region", {
      name: "Customer reviews",
    });
    expect(within(reviews).getByText("Not available")).toBeInTheDocument();
    expect(within(reviews).getByText("No public rating is published.")).toBeInTheDocument();

    const social = within(footer).getByRole("region", {
      name: "Social channels",
    });
    expect(within(social).getByText("Not published")).toBeInTheDocument();
    expect(within(social).queryByRole("link")).not.toBeInTheDocument();
    expect(within(social).queryByRole("button")).not.toBeInTheDocument();

    const checkout = within(footer).getByRole("region", {
      name: "Checkout methods",
    });
    expect(checkout).toHaveTextContent("Stripe sandbox only — no live payments");
    expect(within(checkout).queryByRole("link")).not.toBeInTheDocument();
    expect(within(checkout).queryByRole("button")).not.toBeInTheDocument();
    expect(within(footer).getByText("EN · USD display only")).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /store locator/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^events$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /instagram/i })).not.toBeInTheDocument();
  });

  it("toggles mobile groups and opens the cookie notice", async () => {
    const user = userEvent.setup();
    render(<SiteFooter />);

    const mobileGroups = screen.getByLabelText("Footer links");
    expect(mobileGroups.querySelectorAll("details")).toHaveLength(4);
    const navigate = within(mobileGroups).getByText("Navigate");
    const navigateDetails = navigate.closest("details");
    expect(navigateDetails).not.toHaveAttribute("open");
    await user.click(navigate);
    expect(navigateDetails).toHaveAttribute("open");
    expect(within(mobileGroups).getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/collections/shop",
    );

    const account = within(mobileGroups).getByText("Account");
    const accountDetails = account.closest("details");
    expect(accountDetails).not.toHaveAttribute("open");
    account.focus();
    expect(account).toHaveFocus();
    expect(account.tagName).toBe("SUMMARY");
    await user.click(account);
    expect(accountDetails).toHaveAttribute("open");
    expect(within(mobileGroups).getByRole("link", { name: "Create account" }))
      .toHaveAttribute("href", "/account/sign-up");

    await user.click(screen.getByRole("button", { name: "Cookie notice" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie notice" });
    expect(dialog).toHaveTextContent("Essential cookies");
    expect(dialog).toHaveTextContent("Payment messaging");
    expect(dialog).toHaveTextContent("Active when eligible");
    await user.click(within(dialog).getByRole("button", { name: /acknowledge notice/i }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Cookie notice acknowledged.",
    );
  });
});

describe("legal and support content", () => {
  it("keeps Legal Documents visibly unavailable until a Legal Operator exists", () => {
    render(<LegalDocumentLayout document={termsOfService} />);

    expect(screen.getByText("Not in effect")).toBeInTheDocument();
    expect(screen.getByText(/helix is the brand, not a legal person or entity/i))
      .toBeInTheDocument();
    expect(screen.getByText(/No Legal Operator or verified legal contact details/i))
      .toBeInTheDocument();
    expect(screen.queryByText("Official")).not.toBeInTheDocument();
  });

  it("uses helix metadata across trust, support, and policy routes", () => {
    expect([
      faqMetadata,
      contactMetadata,
      accessibilityMetadata,
      privacyMetadata,
      privacyChoicesMetadata,
      cookiePolicyMetadata,
      termsMetadata,
    ].map((value) => ({
      title: value.title,
      siteName: value.openGraph && "siteName" in value.openGraph
        ? value.openGraph.siteName
        : undefined,
    }))).toEqual([
      { title: "FAQ | helix", siteName: "helix" },
      { title: "Contact | helix", siteName: "helix" },
      { title: "Accessibility Statement | helix", siteName: "helix" },
      { title: "Privacy Policy | helix", siteName: "helix" },
      { title: "Your Privacy Choices | helix", siteName: "helix" },
      { title: "Cookie Policy | helix", siteName: "helix" },
      { title: "Terms of Service | helix", siteName: "helix" },
    ]);
  });

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
    expect(combined).toMatch(/helix rewards/i);
    expect(combined).not.toMatch(/MEI PELLE REWARDS|loyalty/i);
    expect(combined).toMatch(/does not submit or store messages/i);
    expect(combined).toMatch(/WCAG 2\.2 AA/i);
    expect(combined).not.toMatch(/Mei[ _-]Pelle/i);
    expect(combined).not.toMatch(/helix (?:is responsible|will be liable|disclaims)/i);
    const publicSentences = [
      ...[
        accessibilityStatement,
        cookiePolicy,
        privacyChoices,
        privacyPolicy,
        termsOfService,
      ].flatMap((document) => [
        document.intro,
        ...document.sections.flatMap((section) => section.body),
      ]),
      ...faqCategories.flatMap((category) =>
        category.items.map((item) => item.answer),
      ),
    ].join("\n");
    expect(publicSentences).not.toMatch(/^helix (?:is|rewards)/m);
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

    const essential = cookieCategories.find(
      (category) => category.category === "Essential",
    );
    expect(essential?.examples).toEqual(
      expect.arrayContaining([
        GUEST_CART_COOKIE,
        PENDING_CHECKOUT_COOKIE,
        REFERRAL_COOKIE,
        COOKIE_ACKNOWLEDGEMENT_COOKIE,
      ]),
    );
    expect(documentText({ cookieCategories, cookiePolicy, privacyPolicy, privacyChoices }))
      .not.toMatch(/mei_pelle|cookie preferences|cookie-preference|consent/i);
  });

  it("describes the visible acknowledgement as required and functional", () => {
    render(<PrivacyChoicesPage />);

    expect(screen.getByText(/required and functional storage acknowledgement/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/essential-storage acknowledgement/i))
      .not.toBeInTheDocument();
  });

  it("states the unavailable Support Intake and factual Accessibility Commitment", () => {
    expect(contactIntakeStatus).toEqual({
      configured: false,
      heading: "SUPPORT INTAKE UNAVAILABLE",
      message:
        "No verified public Support Channel has been published for helix. This page only prepares inquiry details; it cannot submit a Support Inquiry.",
    });

    const accessibilityText = documentText(accessibilityStatement);
    expect(accessibilityText).toMatch(/Accessibility Commitment/);
    expect(accessibilityText).toMatch(/target, not a formal certification/i);
    expect(accessibilityText).toMatch(/No verified public Support Channel/);
    expect(accessibilityText).not.toMatch(/Mei[ _-]Pelle/i);
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
    expect(faqText).toMatch(/No real shipping or Fulfillment capability is available/i);
    expect(faqText).toMatch(/No operative Return Policy is in effect/i);
    expect(faqText).toMatch(/Terms status page/i);
    expect(faqText).not.toMatch(/Does helix offer|Report the issue within|Approved refunds/i);
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
