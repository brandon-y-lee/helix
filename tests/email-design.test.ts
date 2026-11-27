import { describe, expect, it } from "vitest";
import { buildAuthEmailTemplates } from "@/lib/email/auth-templates";
import { renderOrderConfirmation } from "@/lib/email/order-confirmation";
import { renderOrderTracking } from "@/lib/email/order-tracking";

const identity = { siteOrigin: "https://helix.example.test", replyTo: "support@example.test" };
export async function representativeEmails() {
  const auth = buildAuthEmailTemplates(identity.siteOrigin);
  return {
    confirmation: auth.mailer_templates_confirmation_content,
    password: auth.mailer_templates_recovery_content,
    emailChange: auth.mailer_templates_email_change_content,
    order: (await renderOrderConfirmation({
      orderNumber: "HX-DEMO-0042", currency: "USD",
      items: [{ name: "Super Serum · 30 mL", quantity: 2, unitPriceCents: 2500, lineSubtotalCents: 5000 },
        { name: "Daily Cleanser · 120 mL", quantity: 1, unitPriceCents: 1900, lineSubtotalCents: 1900 }],
      merchandiseSubtotalCents: 6900, discountCents: 500, shippingCents: 600, taxCents: 665, totalCents: 7665,
      shippingName: "Demo Customer", shippingAddress: { line1: "123 Example Street", line2: "Unit 4",
        city: "Los Angeles", state: "CA", postal_code: "90001", country: "US" },
    }, identity)).html,
    tracking: (await renderOrderTracking({
      orderNumber: "HX-DEMO-0042", shipmentNumber: 2, status: "exception", occurredAt: "2026-10-07T18:30:00Z",
      items: [{ name: "Super Serum", variantLabel: "30 mL", quantity: 2 },
        { name: "Daily Cleanser", variantLabel: "120 mL", quantity: 1 }],
    }, identity)).html,
  };
}

describe("email design accessibility and compatibility", () => {
  it("preserves language and direction when a mail client strips root attributes", async () => {
    for (const html of Object.values(await representativeEmails())) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.documentElement.removeAttribute("lang");
      doc.documentElement.removeAttribute("dir");
      for (const child of doc.body.children) {
        expect(child.getAttribute("lang")).toBe("en");
        expect(child.getAttribute("dir")).toBe("ltr");
      }
    }
  });

  it("keeps the authored light canvas seamless with HTML fallbacks and advisory color-scheme hints", async () => {
    for (const html of Object.values(await representativeEmails())) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect(doc.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe("light only");
      expect(doc.querySelector('meta[name="supported-color-schemes"]')?.getAttribute("content")).toBe("light");
      expect(doc.body.style.colorScheme).toBe("light only");
      for (const surface of [doc.body, ...doc.querySelectorAll('table[width="100%"]')].slice(0, 3)) {
        expect(surface.getAttribute("bgcolor")).toBe("#ffffff");
      }
      const outerCell = doc.body.querySelector('td[align="center"]') as HTMLElement;
      expect(doc.body.style.backgroundColor).toBe("rgb(255, 255, 255)");
      expect(outerCell.style.backgroundColor).toBe(doc.body.style.backgroundColor);
      const content = outerCell.querySelector('td') as HTMLElement;
      expect(content.style.backgroundColor).toBe(doc.body.style.backgroundColor);
      const logo = doc.querySelector("img")!;
      expect(logo.style.backgroundColor).toBe(doc.body.style.backgroundColor);
      expect(logo.style.color).toBe("rgb(17, 19, 18)");
    }
  });

  it("keeps messages readable with one controlled PNG and safe font and layout fallbacks", async () => {
    for (const html of Object.values(await representativeEmails())) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect(doc.documentElement.lang).toBe("en");
      expect(doc.documentElement.dir).toBe("ltr");
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.querySelectorAll("h1")).toHaveLength(1);
      expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull();
      expect(doc.querySelector('[aria-hidden="true"]')?.textContent?.length).toBeGreaterThan(0);
      expect(doc.querySelector("script, svg, iframe, form, link[rel='stylesheet']")).toBeNull();
      expect(doc.querySelectorAll("img")).toHaveLength(1);
      const logo = doc.querySelector("img")!;
      expect(logo.src).toBe("https://helix.example.test/brand/helix-wordmark-email.png");
      expect(logo.alt).toBe("helix");
      expect(logo.width).toBe(128);
      expect(logo.height).toBe(53);
      expect(html).not.toMatch(/display:\s*(flex|grid)|var\(--|@import|@media/i);
      for (const table of doc.querySelectorAll("table")) {
        if (!table.querySelector("th")) expect(table.getAttribute("role")).toBe("presentation");
      }
      for (const link of doc.querySelectorAll("a")) {
        expect(link.textContent?.trim().length).toBeGreaterThan(0);
        expect(link.getAttribute("href")).toMatch(/^(https:\/\/helix\.example\.test\/|mailto:support@example\.test$)/);
      }
      expect(new TextEncoder().encode(html).length).toBeLessThan(102_000);
    }
  });
});
