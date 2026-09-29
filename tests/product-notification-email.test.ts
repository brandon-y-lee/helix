import { describe, expect, it } from "vitest";
import { renderProductNotification } from "@/lib/waitlist/templates";

const identity = { siteOrigin: "https://helixskin.vercel.app", replyTo: "support@example.test" };
const productId = "d7f29a08-9d0c-409b-b460-62eafc77806a";
const available = { schemaVersion: 1, enrollmentId: 1, generation: 1, transitionId: 2,
  productId, productName: "Helix & <Product>", productSlug: "daily-product" };
describe("requested Product notification emails", () => {
  it("sends one specific public Product notice without inventing stock, access priority, or marketing permission", async () => {
    const mail = await renderProductNotification("product_availability", available, identity);
    expect(mail.text).toContain("https://helixskin.vercel.app/products/daily-product");
    expect(mail.text).toContain("You requested this one-time Product availability notification.");
    expect(mail.text).toContain("Availability can change");
    expect(mail.html).toContain("Helix &amp; &lt;Product&gt;");
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain('role="presentation"');
    expect(mail.html).not.toMatch(/<script|<img|\bOrder\b|priority access/i);
  });
  it("makes each recovery link withdrawal-only and explains bounded continuation", async () => {
    const mail = await renderProductNotification("product_waitlist_recovery", { schemaVersion: 1, links: [
      { enrollmentId: 1, generation: 1, productId, productName: "Product notification", token: "T".repeat(43), expiresAt: "2026-09-30T00:00:00Z" },
    ] }, identity);
    expect(mail.text).toContain(`https://helixskin.vercel.app/product-notifications?cancel=${"T".repeat(43)}`);
    expect(mail.text).toContain("Opening a link does not cancel anything.");
    expect(mail.text).toContain("request links again after one minute");
    expect(mail.text).not.toContain("marketing subscription is cancelled");
    expect(mail.subject).not.toContain("TTTT");
  });
  it.each([
    { ...available, productSlug: "../account" },
    { ...available, productName: "Product\r\nBcc: other@example.test" },
    { schemaVersion: 1, links: [{ enrollmentId: 1, generation: 1, productId, productName: "Product", token: "bad", expiresAt: "2026-09-30T00:00:00Z" }] },
  ])("rejects malformed stored message facts instead of producing unsafe links", async (receipt) => {
    await expect(renderProductNotification("links" in receipt ? "product_waitlist_recovery" : "product_availability", receipt, identity)).rejects.toThrow();
  });
});
