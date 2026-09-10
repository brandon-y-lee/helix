import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FAQAccordion } from "@/components/content/FAQAccordion";
import { faqCategories } from "@/content/support/faq";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { termsOfService } from "@/content/legal/terms";

describe("mobile service navigation", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("lets readers expand the Legal Document contents and follow a section link", async () => {
    const user = userEvent.setup();
    render(<LegalDocumentLayout document={termsOfService} />);

    const contents = screen.getByText("Contents", { selector: "summary" });
    const disclosure = contents.closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");

    await user.click(contents);

    expect(disclosure).toHaveAttribute("open");
    const firstSection = termsOfService.sections[0];
    const link = within(disclosure).getByRole("link", {
      name: firstSection.title,
    });
    expect(link).toHaveAttribute("href", `#${firstSection.id}`);
    expect(document.getElementById(firstSection.id)).toHaveTextContent(
      firstSection.title,
    );
  });

  it("identifies the FAQ category from the URL and follows fragment changes", () => {
    window.history.replaceState(null, "", "/faq#shipping");
    render(<FAQAccordion categories={faqCategories} />);

    const navigation = screen.getByRole("navigation", { name: "FAQ categories" });
    const shipping = within(navigation).getByRole("link", { name: "Shipping" });
    const returns = within(navigation).getByRole("link", { name: "Returns & Refunds" });
    expect(shipping).toHaveAttribute("aria-current", "location");
    expect(returns).not.toHaveAttribute("aria-current");

    act(() => {
      window.history.replaceState(null, "", "/faq#returns");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(returns).toHaveAttribute("aria-current", "location");
    expect(shipping).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Can I place an order right now?").closest("details"))
      .toHaveAttribute("open");
  });

  it("starts FAQ readers at Products without adding a URL fragment", () => {
    render(<FAQAccordion categories={faqCategories} />);

    const navigation = screen.getByRole("navigation", { name: "FAQ categories" });
    expect(within(navigation).getByRole("link", { name: "Products" }))
      .toHaveAttribute("aria-current", "location");
    expect(window.location.hash).toBe("");
  });
});
