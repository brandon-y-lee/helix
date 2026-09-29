import { describe, expect, it } from "vitest";
import {
  renderOrderTracking,
  type OrderTrackingReceipt,
} from "@/lib/email/order-tracking";

const receipt: OrderTrackingReceipt = {
  orderNumber: "HX-20260928-0042",
  shipmentNumber: 2,
  status: "dispatched",
  occurredAt: "2026-09-29T18:30:00.123456+00:00",
  items: [
    { name: "Super Serum", variantLabel: "30 mL", quantity: 2 },
    { name: "Daily Cleanser", variantLabel: "120 mL", quantity: 1 },
  ],
};

const config = {
  siteOrigin: "https://helixskin.vercel.app",
  replyTo: "support@example.test",
};

describe("Simulated Shipment tracking email", () => {
  it("renders the committed simulated dispatch and allocated items in accessible HTML and plain text", async () => {
    const message = await renderOrderTracking(receipt, config);
    const document = new DOMParser().parseFromString(message.html, "text/html");

    expect(message.subject).toBe("[DEMO] helix order HX-20260928-0042 — simulated dispatch");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe(message.subject);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe("Simulated shipment dispatched");
    expect([...document.querySelectorAll("th[scope='col']")].map((cell) => cell.textContent))
      .toEqual(["Item", "Quantity"]);
    for (const expected of [
      "DEMO PURCHASE",
      "No real charge occurred. No goods will ship.",
      "All carrier events are simulated.",
      "Order HX-20260928-0042",
      "Simulated shipment 2",
      "Sep 29, 2026, 6:30 PM UTC",
      "Super Serum",
      "30 mL",
      "Daily Cleanser",
      "120 mL",
      config.replyTo,
    ]) {
      expect(document.body.textContent).toContain(expected);
      expect(message.text).toContain(expected);
    }
    expect(message.text).toContain("Super Serum · 30 mL: 2");
    expect(message.text).toContain("Daily Cleanser · 120 mL: 1");
    expect([...document.querySelectorAll("a")].map((link) => link.getAttribute("href")))
      .toEqual(["https://helixskin.vercel.app/contact"]);
    expect(message.text).toContain("https://helixskin.vercel.app/contact");
    expect(message.html).not.toMatch(/session_id|receipt_token|\/account\/orders|\/checkout\/success/);
    expect(message.text).not.toMatch(/session_id|receipt_token|\/account\/orders|\/checkout\/success/);
  });

  it.each([
    ["delivered", "simulated delivery", "Simulated shipment delivered"],
    ["exception", "simulated exception", "Simulated shipment exception"],
  ] as const)("labels the %s event consistently without claiming physical carrier activity", async (status, subjectStatus, title) => {
    const message = await renderOrderTracking({ ...receipt, status }, config);
    const document = new DOMParser().parseFromString(message.html, "text/html");

    expect(message.subject).toBe(`[DEMO] helix order HX-20260928-0042 — ${subjectStatus}`);
    expect(document.querySelector("h1")?.textContent).toBe(title);
    expect(document.body.textContent).toContain("No real charge occurred. No goods will ship.");
    expect(document.body.textContent).toContain("All carrier events are simulated.");
    expect(message.text).toContain(title);
    expect(message.text).toContain("No real charge occurred. No goods will ship.");
    expect(message.text).toContain("All carrier events are simulated.");
    expect(message.text).not.toMatch(/arrived|on the way|delivery estimate/i);
  });

  it("rejects invalid or oversized shipment facts before producing a message", async () => {
    const invalidReceipts: unknown[] = [
      null, {},
      { ...receipt, orderNumber: "HX-0042\r\nBcc: other@example.test" },
      { ...receipt, orderNumber: "HX-0042\n" },
      { ...receipt, orderNumber: "x".repeat(65) },
      { ...receipt, shipmentNumber: 0 },
      { ...receipt, shipmentNumber: 1.5 },
      { ...receipt, shipmentNumber: "2" },
      { ...receipt, shipmentNumber: 2_147_483_648 },
      { ...receipt, status: "in_transit" },
      { ...receipt, status: "toString" },
      { ...receipt, items: [] },
      { ...receipt, items: new Array(1) },
      { ...receipt, items: Array.from({ length: 101 }, () => receipt.items[0]) },
      { ...receipt, items: [null] },
      ...["", " ", "x".repeat(201), "Serum\nForged", "Serum\u0085Forged"].map((name) => ({
        ...receipt, items: [{ ...receipt.items[0], name }],
      })),
      ...[null, " ", "x".repeat(201), "30mL\tForged"].map((variantLabel) => ({
        ...receipt, items: [{ ...receipt.items[0], variantLabel }],
      })),
      ...[0, 100, 1.5, NaN, Infinity, "2"].map((quantity) => ({
        ...receipt, items: [{ ...receipt.items[0], quantity }],
      })),
      ...[
        null, 1_798_000_000_000, "yesterday", "09/29/2026", "2026-09-29T18:30:00",
        "2026-09-29T18:30:00Z\n", "2026-02-30T18:30:00Z", "2026-02-29T18:30:00Z",
        "2026-09-29T24:00:00Z", "2026-09-29T18:60:00Z", "2026-09-29T18:30:60Z",
        "2026-09-29T18:30:00+25:00", "2026-09-29T18:30:00+00:60",
      ].map((occurredAt) => ({ ...receipt, occurredAt })),
    ];

    for (const invalid of invalidReceipts) {
      await expect(renderOrderTracking(invalid as OrderTrackingReceipt, config))
        .rejects.toThrow("Invalid order tracking receipt.");
    }
  });

  it("requires a bounded reply address and an unambiguous HTTPS site origin", async () => {
    const invalidConfigs: unknown[] = [
      null, {},
      ...[
        "javascript:alert(1)", "http://example.test", "http://localhost:3000",
        "https://user:password@example.test", "https://example.test/contact",
        "https://example.test?token=private", "https://example.test#private",
        "https://exam\tple.test", " https://example.test", "https://example.test/..",
      ].map((siteOrigin) => ({ ...config, siteOrigin })),
      ...[null, "support", "support@example.test\r\nBcc: other@example.test",
        "support\u0000@example.test", `${"x".repeat(242)}@example.test`]
        .map((replyTo) => ({ ...config, replyTo })),
    ];

    for (const invalid of invalidConfigs) {
      await expect(renderOrderTracking(receipt, invalid as typeof config))
        .rejects.toThrow("Invalid order tracking identity.");
    }
  });

  it("renders an item without a variant label cleanly and preserves its event instant across timezone offsets", async () => {
    const message = await renderOrderTracking({
      ...receipt,
      occurredAt: "2026-09-29T11:30:00-07:00",
      items: [{ ...receipt.items[0], variantLabel: "" }],
    }, config);
    const document = new DOMParser().parseFromString(message.html, "text/html");

    expect(message.text).toContain("Super Serum: 2");
    expect(message.text).not.toContain("Super Serum ·");
    expect(document.querySelector("table[aria-label='Simulated shipment items'] tbody td")?.textContent)
      .toBe("Super Serum");
    expect(document.body.textContent).toContain("Sep 29, 2026, 6:30 PM UTC");
    expect(message.text).toContain("Sep 29, 2026, 6:30 PM UTC");
  });

  it("escapes item text, excludes private fields, and uses only the configured contact link after a domain change", async () => {
    const name = "<img src=x onerror=alert(1)> & Serum";
    const variantLabel = "<script>alert(1)</script>";
    const suppliedReceipt = {
      ...receipt,
      occurredAt: "2028-02-29T12:00:00Z",
      items: [{ name, variantLabel, quantity: 1 }],
      shippingAddress: { line1: "Private shipping address" },
      operatorEmail: "private-operator@example.test",
      reason: "Private exception resolution reason",
      receiptToken: "private-receipt-capability",
      trackingUrl: "https://carrier.example.test/private-tracking",
    };
    const message = await renderOrderTracking(suppliedReceipt, {
      siteOrigin: "https://new-helix.example/", replyTo: "support@new-helix.example",
    });
    const document = new DOMParser().parseFromString(message.html, "text/html");

    expect(document.querySelector("img, script, [onerror]")).toBeNull();
    expect(document.body.textContent).toContain(name);
    expect(document.body.textContent).toContain(variantLabel);
    expect(message.text).toContain(`${name} · ${variantLabel}: 1`);
    expect(document.body.textContent).toContain("Feb 29, 2028, 12:00 PM UTC");
    expect(message.text).toContain("Feb 29, 2028, 12:00 PM UTC");
    expect([...document.querySelectorAll("a")].map((link) => link.href))
      .toEqual(["https://new-helix.example/contact"]);
    for (const excluded of [
      "Private shipping address", "private-operator@example.test", "Private exception resolution reason",
      "private-receipt-capability", "https://carrier.example.test/private-tracking", config.siteOrigin,
    ]) {
      expect(message.html).not.toContain(excluded);
      expect(message.text).not.toContain(excluded);
    }
  });

  it("preserves all 100 bounded item lines without truncating names or quantities", async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      name: `${index + 1} ${'"'.repeat(196)}`,
      variantLabel: '"'.repeat(200),
      quantity: 99,
    }));
    const message = await renderOrderTracking({ ...receipt, items, shipmentNumber: 2_147_483_647 }, config);
    const document = new DOMParser().parseFromString(message.html, "text/html");

    expect(document.querySelectorAll("table[aria-label='Simulated shipment items'] tbody tr")).toHaveLength(100);
    for (const item of items) {
      expect(document.body.textContent).toContain(item.name);
      expect(document.body.textContent).toContain(item.variantLabel);
      expect(message.text).toContain(`${item.name} · ${item.variantLabel}: 99`);
    }
    expect(message.text).toContain("Simulated shipment 2147483647");
    expect(new TextEncoder().encode(message.html).byteLength).toBeLessThan(1_000_000);
    expect(new TextEncoder().encode(message.text).byteLength).toBeLessThan(1_000_000);
  });
});
