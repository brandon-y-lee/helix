import { describe, expect, it } from "vitest";
import {
  renderOrderConfirmation,
  type OrderConfirmationReceipt,
} from "@/lib/email/order-confirmation";

const receipt: OrderConfirmationReceipt = {
  orderNumber: "HX-20260928-0042",
  currency: "USD",
  items: [
    { name: "Super Serum · 30 mL", quantity: 2, unitPriceCents: 2500, lineSubtotalCents: 5000 },
    { name: "Daily Cleanser · 120 mL", quantity: 1, unitPriceCents: 1900, lineSubtotalCents: 1900 },
  ],
  merchandiseSubtotalCents: 6900,
  discountCents: 500,
  shippingCents: 600,
  taxCents: 665,
  totalCents: 7665,
  shippingName: "Demo Customer",
  shippingAddress: {
    line1: "123 Example Street",
    line2: "Unit 4",
    city: "Los Angeles",
    state: "CA",
    postal_code: "90001",
    country: "US",
  },
};

const identity = {
  siteOrigin: "https://helixskin.vercel.app",
  replyTo: "support@example.test",
};

describe("Sandbox Order confirmation email", () => {
  it("renders the fixed receipt and unmistakable demo disclosure in accessible HTML and plain text", () => {
    const message = renderOrderConfirmation(receipt, identity);
    const document = new DOMParser().parseFromString(message.html, "text/html");

    expect(message.subject).toBe("[DEMO] helix order HX-20260928-0042 confirmed");
    expect(document.documentElement.lang).toBe("en");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe("Demo order confirmed");
    expect(document.title).toBe(message.subject);
    expect(document.querySelector("th[scope='col']")?.textContent).toBe("Item");
    for (const expected of [
      "No real charge occurred. No goods will ship.",
      "HX-20260928-0042",
      "Super Serum · 30 mL",
      "2 × $25.00",
      "$50.00",
      "Merchandise subtotal",
      "$69.00",
      "−$5.00",
      "$6.00",
      "$6.65",
      "$76.65",
      "Demo Customer",
      "123 Example Street",
      "Unit 4",
      "Los Angeles, CA 90001",
    ]) {
      expect(document.body.textContent).toContain(expected);
      expect(message.text).toContain(expected);
    }
    expect(document.querySelector("a")?.getAttribute("href"))
      .toBe("https://helixskin.vercel.app/contact");
    expect(message.text).toContain("https://helixskin.vercel.app/contact");
    expect(message.text).toContain(identity.replyTo);
    expect(message.html).not.toMatch(/session_id|receipt_token|\/account\/orders|\/checkout\/success/);
    expect(message.text).not.toMatch(/session_id|receipt_token|\/account\/orders|\/checkout\/success/);
  });

  it("rejects unsafe or oversized receipt content without truncating accepted order facts", () => {
    const invalidReceipts: OrderConfirmationReceipt[] = [
      { ...receipt, orderNumber: "HX-0042\r\nBcc: other@example.test" },
      { ...receipt, items: [] },
      { ...receipt, items: Array.from({ length: 51 }, () => receipt.items[0]) },
      { ...receipt, items: [{ ...receipt.items[0], name: "a".repeat(201) }] },
      { ...receipt, shippingName: "Demo\nForged order" },
      { ...receipt, totalCents: 7665.1 },
      { ...receipt, totalCents: Number.MAX_SAFE_INTEGER + 1 },
      { ...receipt, discountCents: -500 },
      { ...receipt, items: [{ ...receipt.items[0], quantity: 0 }] },
    ];

    for (const invalidReceipt of invalidReceipts) {
      expect(() => renderOrderConfirmation(invalidReceipt, identity))
        .toThrow("Invalid order confirmation receipt.");
    }
  });

  it("uses only safe configured contact URLs and escapes customer and product text", () => {
    for (const siteOrigin of [
      "javascript:alert(1)",
      "https://user:password@example.test",
      "https://example.test/checkout?token=private",
      "http://example.test",
    ]) {
      expect(() => renderOrderConfirmation(receipt, { ...identity, siteOrigin }))
        .toThrow("Invalid order confirmation identity.");
    }
    expect(() => renderOrderConfirmation(receipt, {
      ...identity,
      replyTo: "support@example.test\r\nBcc: other@example.test",
    })).toThrow("Invalid order confirmation identity.");

    const productName = "<img src=x onerror=alert(1)> & Serum";
    const customerName = "<script>alert(1)</script>";
    const message = renderOrderConfirmation({
      ...receipt,
      shippingName: customerName,
      items: [{ ...receipt.items[0], name: productName }],
    }, { ...identity, siteOrigin: "https://new-helix.example" });
    const document = new DOMParser().parseFromString(message.html, "text/html");

    expect(document.querySelector("img, script, [onerror]")).toBeNull();
    expect(document.body.textContent).toContain(productName);
    expect(document.body.textContent).toContain(customerName);
    expect(message.text).toContain(productName);
    expect(message.text).toContain(customerName);
    expect([...document.querySelectorAll("a")].map((link) => link.href))
      .toEqual(["https://new-helix.example/contact"]);
    expect(message.text).toContain("https://new-helix.example/contact");
    expect(message.html).not.toContain(identity.siteOrigin);
  });

  it("accepts a verified address without a second line and keeps the largest supported receipt below email clipping limits", () => {
    const message = renderOrderConfirmation({
      ...receipt,
      items: Array.from({ length: 50 }, () => ({ ...receipt.items[0], name: '"'.repeat(200) })),
      shippingName: '"'.repeat(200),
      shippingAddress: {
        ...receipt.shippingAddress,
        line1: '"'.repeat(200),
        line2: null,
        city: '"'.repeat(200),
        state: '"'.repeat(200),
      },
    }, identity);
    expect(message.text).not.toContain("null");
    expect(new TextEncoder().encode(message.html).byteLength).toBeLessThan(102_000);
  });
});
