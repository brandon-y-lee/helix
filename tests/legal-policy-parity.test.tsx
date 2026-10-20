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
    it(`${policy.canonical} preserves every source clause, heading and link in order`, () => {
      const source = fragment(fs.readFileSync(`docs/evidence/legal-revetir-2026-10-20/source/${slug}.rendered.article.html`, "utf8"));
      const actual = fragment(renderToStaticMarkup(<PolicyDocumentLayout document={policy} />));
      const blocks = (root: Element) => [...root.querySelectorAll("h1,h2,h3,h4,p,li")].map((node) => ({ tag: node.tagName, text: normalize(node.textContent) }));
      expect(blocks(actual)).toEqual(blocks(source).map((block) => ({ ...block, text: substitute(block.text) })));
      const expectedLinks = [...source.querySelectorAll("a")].map((a) => ({ text: substitute(normalize(a.textContent)), href: links[a.getAttribute("href")!] }));
      expect(expectedLinks.every((a) => a.href)).toBe(true);
      expect([...actual.querySelectorAll("a")].map((a) => ({ text: normalize(a.textContent), href: a.getAttribute("href") }))).toEqual(expectedLinks);
      expect(actual.querySelectorAll("h1")).toHaveLength(1);
      expect(actual.textContent).not.toMatch(/REVETIR|care@revetir\.com|Not in effect|prelaunch|No Legal Operator|not an operative/i);
      expect(actual.querySelector("script,iframe,style,[onclick]")).toBeNull();
    });
  }

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
