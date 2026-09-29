/* eslint-disable @next/next/no-head-element -- This document is an email, not a Next.js page. */
import "server-only";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type OrderConfirmationReceipt = {
  orderNumber: string;
  currency: "USD";
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    lineSubtotalCents: number;
  }>;
  merchandiseSubtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingName: string;
  shippingAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
};

type EmailIdentity = { siteOrigin: string; replyTo: string };

const paragraph: CSSProperties = { margin: "0 0 16px", lineHeight: "24px" };
const cell: CSSProperties = { padding: "14px 0", textAlign: "left", verticalAlign: "top" };
const amountCell: CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
const heading: CSSProperties = {
  color: "#111312",
  fontFamily: "Marcellus, Georgia, serif",
  fontWeight: 400,
};
const demoNotice = "No real charge occurred. No goods will ship.";

function assertReceipt(receipt: OrderConfirmationReceipt): void {
  const text = (value: unknown, maximum = 200) => typeof value === "string"
    && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
  const cents = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const address = receipt?.shippingAddress;
  const valid = receipt && receipt.currency === "USD"
    && typeof receipt.orderNumber === "string" && /^[A-Za-z0-9-]{1,64}$/.test(receipt.orderNumber)
    // Match the existing Order admission and verified Checkout bundle ceiling.
    && Array.isArray(receipt.items) && receipt.items.length > 0 && receipt.items.length <= 100
    && receipt.items.every((item) => item && text(item.name)
      && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 999
      && cents(item.unitPriceCents) && cents(item.lineSubtotalCents))
    && [receipt.merchandiseSubtotalCents, receipt.discountCents, receipt.shippingCents,
      receipt.taxCents, receipt.totalCents].every(cents)
    && text(receipt.shippingName) && address && text(address.line1)
    && (address.line2 === undefined || address.line2 === null || address.line2 === "" || text(address.line2))
    && text(address.city) && text(address.state) && text(address.postal_code, 32)
    && typeof address.country === "string" && /^[A-Z]{2}$/.test(address.country);
  if (!valid) throw new Error("Invalid order confirmation receipt.");
}

function contactUrlFor(identity: EmailIdentity): string {
  try {
    const origin = new URL(identity.siteOrigin);
    const localHttp = origin.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if ((origin.protocol !== "https:" && !localHttp)
      || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
      || typeof identity.replyTo !== "string" || identity.replyTo.length > 254
      || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(identity.replyTo)) {
      throw new Error();
    }
    return new URL("/contact", origin).href;
  } catch {
    throw new Error("Invalid order confirmation identity.");
  }
}

export function renderOrderConfirmation(
  receipt: OrderConfirmationReceipt,
  identity: EmailIdentity,
): { subject: string; html: string; text: string } {
  assertReceipt(receipt);
  const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: receipt.currency,
  }).format(cents / 100);
  const subject = `[DEMO] helix order ${receipt.orderNumber} confirmed`;
  const contactUrl = contactUrlFor(identity);
  const addressLines = [
    receipt.shippingName,
    receipt.shippingAddress.line1,
    receipt.shippingAddress.line2,
    `${receipt.shippingAddress.city}, ${receipt.shippingAddress.state} ${receipt.shippingAddress.postal_code}`,
    receipt.shippingAddress.country,
  ].filter((line): line is string => Boolean(line));
  const totals = [
    ["Merchandise subtotal", money(receipt.merchandiseSubtotalCents)],
    ["Discount", `−${money(receipt.discountCents)}`],
    ["Shipping", money(receipt.shippingCents)],
    ["Tax", money(receipt.taxCents)],
    ["Demo order total", money(receipt.totalCents)],
  ];

  const html = "<!DOCTYPE html>" + renderToStaticMarkup(
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{subject}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#f5f5f7", color: "#111312", fontFamily: "Manrope, Arial, sans-serif", fontSize: "16px" }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>
          Your demo order is confirmed. {demoNotice}
        </div>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 12px" }}>
                <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: "600px", backgroundColor: "#ffffff", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "28px 24px" }}>
                        <p style={{ ...heading, margin: "0 0 28px", fontSize: "28px" }}>helix</p>
                        <p style={{ margin: "0 0 10px", color: "#28362f", fontSize: "13px", letterSpacing: "1px", fontWeight: 700 }}>DEMO PURCHASE</p>
                        <h1 style={{ ...heading, fontSize: "30px", lineHeight: "36px", margin: "0 0 16px" }}>Demo order confirmed</h1>
                        <p style={paragraph}>{demoNotice}</p>
                        <p style={paragraph}>Order {receipt.orderNumber}<br />Currency: {receipt.currency}</p>
                        <h2 style={{ ...heading, fontSize: "22px", lineHeight: "28px", margin: "28px 0 8px" }}>Order summary</h2>
                        <table aria-label="Order summary" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse", fontSize: "14px", lineHeight: "22px" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #d8d8dc" }}>
                              <th scope="col" style={cell}>Item</th>
                              <th scope="col" style={amountCell}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receipt.items.map((item, index) => (
                              <tr key={index} style={{ borderBottom: "1px solid #d8d8dc" }}>
                                <td style={{ ...cell, paddingRight: "12px", overflowWrap: "anywhere" }}>
                                  {item.name}<br />{item.quantity} × {money(item.unitPriceCents)}
                                </td>
                                <td style={amountCell}>{money(item.lineSubtotalCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            {totals.map(([label, value], index) => (
                              <tr key={label} style={{ fontWeight: index === totals.length - 1 ? 700 : 400 }}>
                                <th scope="row" style={{ ...cell, padding: "8px 12px 8px 0", fontWeight: "inherit" }}>{label}</th>
                                <td style={{ ...amountCell, padding: "8px 0" }}>{value}</td>
                              </tr>
                            ))}
                          </tfoot>
                        </table>
                        <h2 style={{ ...heading, fontSize: "22px", lineHeight: "28px", margin: "28px 0 12px" }}>Delivery details (demo)</h2>
                        <p style={{ ...paragraph, overflowWrap: "anywhere" }}>
                          {addressLines.map((line, index) => <span key={index}>{line}<br /></span>)}
                        </p>
                        <p style={paragraph}>This address was provided for the checkout demonstration. No physical shipment will be created.</p>
                        <p style={{ ...paragraph, marginTop: "28px" }}>
                          <a href={contactUrl} style={{ color: "#28362f", textDecoration: "underline" }}>Visit helix contact information</a>
                        </p>
                        <p style={{ ...paragraph, fontSize: "13px", color: "#5d5c55", overflowWrap: "anywhere" }}>Reply address: {identity.replyTo}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>,
  );
  const text = [
    "helix — DEMO PURCHASE",
    "Demo order confirmed",
    demoNotice,
    "",
    `Order ${receipt.orderNumber}`,
    `Currency: ${receipt.currency}`,
    "",
    "Order summary",
    ...receipt.items.map((item) => `${item.name}: ${item.quantity} × ${money(item.unitPriceCents)} = ${money(item.lineSubtotalCents)}`),
    "",
    ...totals.map(([label, value]) => `${label}: ${value}`),
    "",
    "Delivery details (demo)",
    ...addressLines,
    "This address was provided for the checkout demonstration. No physical shipment will be created.",
    "",
    `Visit helix contact information: ${contactUrl}`,
    `Reply address: ${identity.replyTo}`,
  ].join("\n");

  return { subject, html, text };
}
