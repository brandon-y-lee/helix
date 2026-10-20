import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PolicyDocumentLayout } from "@/components/content/PolicyDocumentLayout";
import { privacyPolicy } from "@/content/legal/privacy";
import { termsOfService } from "@/content/legal/terms";
import { accessibilityStatement } from "@/content/legal/accessibility";

const substitutions = [
  ["REVETIR LLC", "Helix Labs LLC"],
  ["REVETIR", "Helix"],
  ["Revetir", "Helix"],
  ["care@revetir.com", "support@helixskin.com"],
  ["2 Park Avenue, 20th Floor, New York, NY 10016", "2747 Haste Street, Berkeley CA 94704"],
  ["https://www.revetir.com", "https://helixskin.vercel.app"],
];
const links: Record<string, string> = {
  "/us/customer-care/shipping-policy": "/faq#shipping",
  "/us/customer-care/shipping-policy#duties-taxes": "/faq#shipping",
  "/us/customer-care/return-policy": "/faq#returns",
  "/us/guest/self-serve": "/contact",
  "/us/customer-care/contact-us": "/contact",
  "/us/customer-care": "/contact",
  "mailto:care@revetir.com": "mailto:support@helixskin.com",
};
const substitute = (value: string) => substitutions.reduce((text, [before, after]) => text.replaceAll(before, after), value);
const approvedCorrections: Record<string, { find: string; replace: string }[]> = JSON.parse(
  fs.readFileSync("scripts/legal/approved-factual-corrections.json", "utf8"),
);
const expectedText = (slug: string, text: string) => (approvedCorrections[slug] ?? []).reduce(
  (value, correction) => value.replace(correction.find.trim(), correction.replace.trim()),
  substitute(text),
);
const normalize = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();
function fragment(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

describe("complete authorized local policy copies", () => {
  for (const [slug, policy] of [
    ["privacy-policy", privacyPolicy],
    ["terms-conditions", termsOfService],
    ["accessibility", accessibilityStatement],
  ] as const) {
    it(`${policy.canonical} preserves source wording except the exact approved factual corrections`, () => {
      const source = fragment(fs.readFileSync(`docs/evidence/legal-revetir-2026-10-20/source/${slug}.rendered.article.html`, "utf8"));
      const actual = fragment(renderToStaticMarkup(<PolicyDocumentLayout document={policy} />));
      const blocks = (root: Element) => [...root.querySelectorAll("h1,h2,h3,h4,p,li")].map((node) => ({ tag: node.tagName, text: normalize(node.textContent) }));
      expect(blocks(actual)).toEqual(blocks(source).map((block) => ({ ...block, text: expectedText(slug, block.text).replace(/\s+/g, " ").trim() })));
      const expectedLinks = [...source.querySelectorAll("a")].map((a) => ({ text: substitute(normalize(a.textContent)), href: links[a.getAttribute("href")!] }));
      expect(expectedLinks.every((a) => a.href)).toBe(true);
      expect([...actual.querySelectorAll("a")].map((a) => ({ text: normalize(a.textContent), href: a.getAttribute("href") }))).toEqual(expectedLinks);
      expect(actual.querySelectorAll("h1")).toHaveLength(1);
      expect(actual.textContent).not.toMatch(/REVETIR|care@revetir\.com|Not in effect|prelaunch|No Legal Operator|not an operative/i);
      expect(actual.querySelector("script,iframe,style,[onclick]")).toBeNull();
    });
  }

  it("limits factual changes to the four approved areas and retains unresolved operational wording", () => {
    expect(Object.keys(approvedCorrections).sort()).toEqual(["privacy-policy", "terms-conditions"]);
    for (const correction of Object.values(approvedCorrections).flat()) {
      expect(correction).toHaveProperty("area", expect.stringMatching(/^(accounts|payments|tracking|pricing)$/));
    }
    const privacy = fragment(renderToStaticMarkup(privacyPolicy.content));
    const terms = fragment(renderToStaticMarkup(termsOfService.content));
    expect(privacy.textContent).not.toMatch(/Square|Google login|Google-verified|Meta|Global Privacy Control|turn off Marketing Cookies|update or delete your account data/);
    expect(terms.textContent).not.toMatch(/Square|Live Price|sourcing network|limited to one per customer/);
    expect(privacy.textContent).toContain("We provide at least two methods for you to exercise these rights.");
    expect(privacy.textContent).toContain("we may keep order and billing records for up to 7 years");
    expect(terms.textContent).toContain("Most orders ship 5–7 business days after being placed.");
    expect(terms.textContent).toContain("Helix offers free returns on all orders.");
    expect(terms.textContent).toContain("a refund will be issued to your original payment method within 2 business days.");
    expect([privacy.textContent, terms.textContent].join(" ")).not.toMatch(/\b(?:sandbox|development)\b|live payments (?:are|have been) (?:enabled|activated)/i);
  });

  it("exposes the confirmed operator and accessible email links without adding a contents widget", () => {
    render(<PolicyDocumentLayout document={privacyPolicy} />);
    expect(screen.getByRole("article", { name: "Privacy Policy" })).toHaveTextContent("Helix Labs LLC");
    expect(screen.getByRole("article")).toHaveTextContent("2747 Haste Street, Berkeley CA 94704");
    for (const link of screen.getAllByRole("link", { name: "support@helixskin.com" })) {
      expect(link).toHaveAttribute("href", "mailto:support@helixskin.com");
    }
    expect(screen.queryByText("Contents")).not.toBeInTheDocument();
  });
});
