import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ContactForm } from "@/components/ContactForm";
import { FAQAccordion } from "@/components/FAQAccordion";
import { SiteFooter } from "@/components/SiteFooter";
import { footerLinkGroups } from "@/content/footer";
import { accessibilityStatement } from "@/content/legal/accessibility";
import { cookieCategories, cookiePolicy } from "@/content/legal/cookies";
import { privacyChoices } from "@/content/legal/privacy-choices";
import { privacyPolicy } from "@/content/legal/privacy";
import { termsOfService } from "@/content/legal/terms";
import { faqCategories } from "@/content/support/faq";

function documentText(values: unknown): string {
  return JSON.stringify(values);
}

describe("global footer", () => {
  it("renders truthful link groups and omits unsupported destinations", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("heading", { name: "MEI-PELLE" })).toBeInTheDocument();
    expect(screen.getByText("STAY IN THE SYSTEM.")).toBeInTheDocument();
    expect(screen.getByText("EMAIL UPDATES COMING SOON")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(String(new Date().getFullYear()))),
    ).toBeInTheDocument();

    for (const group of footerLinkGroups) {
      expect(screen.getAllByText(group.label).length).toBeGreaterThan(0);
      for (const link of group.links) {
        expect(screen.getAllByRole("link", { name: link.label }).length).toBeGreaterThan(0);
      }
    }

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
  it("matches actual data practices and avoids unresolved placeholders", () => {
    const combined = documentText({
      privacyPolicy,
      termsOfService,
      cookiePolicy,
      privacyChoices,
      accessibilityStatement,
    });

    expect(combined).not.toMatch(/\[INSERT|INSERT COMPANY|hello@rhodeskin|afterpay/i);
    expect(combined).not.toMatch(/mandatory arbitration|class-action waiver|jury-trial waiver/i);
    expect(combined).not.toMatch(/real payments are available|shipping times|returns are accepted/i);
    expect(combined).toMatch(/Checkout and real payments are not implemented/i);
    expect(combined).toMatch(/does not transmit or store contact messages/i);
    expect(combined).toMatch(/WCAG 2\.2 AA/i);
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

  it("renders FAQ categories and opens accordions without unsupported claims", async () => {
    const user = userEvent.setup();
    render(<FAQAccordion categories={faqCategories} />);

    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      "#faq-products",
    );
    const checkoutQuestion = screen.getByRole("button", {
      name: /Is checkout currently available/i,
    });
    await user.click(checkoutQuestion);
    expect(screen.getByText(/Checkout is a development placeholder/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/shipping times|returns are accepted|vegan/i);
  });

  it("validates contact fields and never fakes submission success", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.click(screen.getByRole("button", { name: "Check message" }));
    expect(screen.getByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No message was sent");

    await user.type(screen.getByLabelText("Name"), "Alex Morgan");
    await user.type(screen.getByLabelText("Email"), "alex@example.com");
    await user.selectOptions(screen.getByLabelText("Inquiry type"), "privacy");
    await user.type(screen.getByLabelText("Subject"), "Privacy request");
    await user.type(
      screen.getByLabelText("Message"),
      "I would like to understand what account data is currently stored.",
    );
    await user.click(screen.getByRole("button", { name: "Check message" }));

    expect(screen.getByRole("status")).toHaveTextContent("No message was sent or stored");
    expect(screen.queryByText(/message sent successfully/i)).not.toBeInTheDocument();
  });
});
