/* eslint-disable @next/next/no-head-element -- This document is an email, not a Next.js page. */
/* eslint-disable @next/next/no-img-element -- Standard PNG images are required for email clients. */
import "server-only";
import type { CSSProperties } from "react";
import { emailDesign } from "@/lib/email/design";
import { render } from "@react-email/render";

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

const paragraph = emailDesign.paragraph;
const cell: CSSProperties = { padding: "14px 0", textAlign: "left", verticalAlign: "top" };
const amountCell: CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
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

export async function renderOrderConfirmation(
  receipt: OrderConfirmationReceipt,
  identity: EmailIdentity,
): Promise<{ subject: string; html: string; text: string }> {
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

  const html = await render(
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content={emailDesign.colorScheme} /><meta name="supported-color-schemes" content="light" /><title>{subject}</title>
      </head>
      <body {...emailDesign.canvasAttributes} style={emailDesign.body}>
        <div lang="en" dir="ltr" aria-hidden="true" style={emailDesign.preheader}>
          Your demo order is confirmed. {demoNotice}
        </div>
        <table lang="en" dir="ltr" role="presentation" {...emailDesign.canvasAttributes} width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td align="center" style={emailDesign.outerCell}>
                <table role="presentation" {...emailDesign.canvasAttributes} width="100%" cellPadding="0" cellSpacing="0" style={emailDesign.container}>
                  <tbody>
                    <tr>
                      <td style={emailDesign.content}>
                        <p style={emailDesign.wordmark}><img src={new URL(emailDesign.wordmarkPath, identity.siteOrigin).href} alt="helix" width={emailDesign.wordmarkWidth} height={emailDesign.wordmarkHeight} style={emailDesign.wordmarkImage} /></p>
                        <p style={emailDesign.eyebrow}>DEMO PURCHASE</p>
                        <h1 style={emailDesign.heading}>Demo order confirmed</h1>
                        <p style={paragraph}>{demoNotice}</p>
                        <p style={paragraph}>Order {receipt.orderNumber}<br />Currency: {receipt.currency}</p>
                        <h2 style={emailDesign.subheading}>Order summary</h2>
                        <table aria-label="Order summary" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse", fontSize: "14px", lineHeight: "22px" }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${emailDesign.line}` }}>
                              <th scope="col" style={cell}>Item</th>
                              <th scope="col" style={amountCell}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receipt.items.map((item, index) => (
                              <tr key={index} style={{ borderBottom: `1px solid ${emailDesign.line}` }}>
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
                        <h2 style={emailDesign.subheading}>Delivery details (demo)</h2>
                        <p style={{ ...paragraph, overflowWrap: "anywhere" }}>
                          {addressLines.map((line, index) => <span key={index}>{line}<br /></span>)}
                        </p>
                        <p style={paragraph}>This address was provided for the checkout demonstration. No physical shipment will be created.</p>
                        <div style={emailDesign.footer}>
                          <p style={{ margin: "0 0 12px" }}>
                            <a href={contactUrl} style={emailDesign.link}>Visit helix contact information</a>
                          </p>
                          <p style={{ margin: 0 }}>Reply address: {identity.replyTo}</p>
                        </div>
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
