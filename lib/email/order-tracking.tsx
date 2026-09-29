/* eslint-disable @next/next/no-head-element -- This document is an email, not a Next.js page. */
import "server-only";
import type { CSSProperties } from "react";
import { render } from "@react-email/render";

export type OrderTrackingReceipt = {
  orderNumber: string;
  shipmentNumber: number;
  status: "dispatched" | "delivered" | "exception";
  occurredAt: string;
  items: Array<{ name: string; variantLabel: string; quantity: number }>;
};

type EmailIdentity = { siteOrigin: string; replyTo: string };

const paragraph: CSSProperties = { margin: "0 0 16px", lineHeight: "24px" };
const cell: CSSProperties = { padding: "14px 0", textAlign: "left", verticalAlign: "top" };
const heading: CSSProperties = {
  color: "#111312",
  fontFamily: "Marcellus, Georgia, serif",
  fontWeight: 400,
};
const demoNotice = "No real charge occurred. No goods will ship.";
const carrierNotice = "All carrier events are simulated.";

function validEventTime(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 32) return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHour, offsetMinute] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]
    && Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 59
    && (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59))
    && Number.isFinite(Date.parse(value));
}

function assertReceipt(receipt: OrderTrackingReceipt): void {
  const text = (value: unknown) => typeof value === "string"
    && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
  const valid = receipt && typeof receipt.orderNumber === "string"
    && /^[A-Za-z0-9-]{1,64}$/.test(receipt.orderNumber)
    && Number.isSafeInteger(receipt.shipmentNumber) && receipt.shipmentNumber > 0 && receipt.shipmentNumber <= 2_147_483_647
    && ["dispatched", "delivered", "exception"].includes(receipt.status)
    && validEventTime(receipt.occurredAt)
    && Array.isArray(receipt.items) && receipt.items.length > 0 && receipt.items.length <= 100
    && Array.from(receipt.items).every((item) => item && text(item.name)
      && (item.variantLabel === "" || text(item.variantLabel))
      && Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99);
  if (!valid) throw new Error("Invalid order tracking receipt.");
}

function contactUrlFor(config: EmailIdentity): string {
  try {
    if (typeof config.siteOrigin !== "string" || config.siteOrigin.length > 2048
      || typeof config.replyTo !== "string" || config.replyTo.length > 254
      || /[\u0000-\u001f\u007f-\u009f]/.test(config.replyTo)
      || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(config.replyTo)) throw new Error();
    const origin = new URL(config.siteOrigin);
    if (origin.protocol !== "https:"
      || (config.siteOrigin !== origin.origin && config.siteOrigin !== `${origin.origin}/`)) throw new Error();
    return new URL("/contact", origin).href;
  } catch {
    throw new Error("Invalid order tracking identity.");
  }
}

export async function renderOrderTracking(
  receipt: OrderTrackingReceipt,
  config: EmailIdentity,
): Promise<{ subject: string; html: string; text: string }> {
  assertReceipt(receipt);
  const status = {
    dispatched: { subject: "simulated dispatch", title: "Simulated shipment dispatched" },
    delivered: { subject: "simulated delivery", title: "Simulated shipment delivered" },
    exception: { subject: "simulated exception", title: "Simulated shipment exception" },
  }[receipt.status];
  const subject = `[DEMO] helix order ${receipt.orderNumber} — ${status.subject}`;
  const title = status.title;
  const contactUrl = contactUrlFor(config);
  const occurredAt = `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(receipt.occurredAt))} UTC`;

  const html = await render(
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{subject}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#f5f5f7", color: "#111312", fontFamily: "Manrope, Arial, sans-serif", fontSize: "16px" }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>
          {title}. {demoNotice} {carrierNotice}
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
                        <h1 style={{ ...heading, fontSize: "30px", lineHeight: "36px", margin: "0 0 16px" }}>{title}</h1>
                        <p style={paragraph}>{demoNotice} {carrierNotice}</p>
                        <p style={{ ...paragraph, overflowWrap: "anywhere" }}>Order {receipt.orderNumber}<br />Simulated shipment {receipt.shipmentNumber}<br />Event time: {occurredAt}</p>
                        <h2 style={{ ...heading, fontSize: "22px", lineHeight: "28px", margin: "28px 0 8px" }}>Items in this simulation</h2>
                        <table aria-label="Simulated shipment items" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse", fontSize: "14px", lineHeight: "22px" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #d8d8dc" }}>
                              <th scope="col" style={cell}>Item</th>
                              <th scope="col" style={{ ...cell, textAlign: "right" }}>Quantity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receipt.items.map((item, index) => (
                              <tr key={index} style={{ borderBottom: "1px solid #d8d8dc" }}>
                                <td style={{ ...cell, paddingRight: "12px", overflowWrap: "anywhere" }}>
                                  {item.name}{item.variantLabel ? <><br />{item.variantLabel}</> : null}
                                </td>
                                <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{item.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p style={{ ...paragraph, marginTop: "28px" }}>
                          <a href={contactUrl} style={{ color: "#28362f", textDecoration: "underline" }}>Visit helix contact information</a>
                        </p>
                        <p style={{ ...paragraph, fontSize: "13px", color: "#5d5c55", overflowWrap: "anywhere" }}>Reply address: {config.replyTo}</p>
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
    "helix — DEMO PURCHASE", title, demoNotice, carrierNotice, "",
    `Order ${receipt.orderNumber}`, `Simulated shipment ${receipt.shipmentNumber}`,
    `Event time: ${occurredAt}`, "", "Items in this simulation",
    ...receipt.items.map((item) => `${item.name}${item.variantLabel ? ` · ${item.variantLabel}` : ""}: ${item.quantity}`),
    "", `Visit helix contact information: ${contactUrl}`, `Reply address: ${config.replyTo}`,
  ].join("\n");

  return { subject, html, text };
}
