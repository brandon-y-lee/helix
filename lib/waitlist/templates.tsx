/* eslint-disable @next/next/no-head-element -- Standalone email document. */
import "server-only";
import { render } from "@react-email/render";
import { isEmailAddress } from "@/lib/email/config";
import { MAX_RECOVERY_LINKS, NOTIFICATION_CAPABILITY, NOTIFICATION_REQUEST_ID } from "@/lib/waitlist/notifications";

export type ProductNotificationPurpose = "product_availability" | "product_waitlist_recovery";
export type ProductAvailabilityReceipt = {
  schemaVersion: 1; enrollmentId: number; generation: number; transitionId: number;
  productId: string; productName: string; productSlug: string;
};
export type ProductRecoveryReceipt = {
  schemaVersion: 1;
  links: Array<{ enrollmentId: number; generation: number; productId: string; productName: string; token: string; expiresAt: string }>;
};
type EmailIdentity = { siteOrigin: string; replyTo: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const label = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 200
  && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);

function parseReceipt(purpose: ProductNotificationPurpose, value: unknown): ProductAvailabilityReceipt | ProductRecoveryReceipt {
  if (!object(value) || value.schemaVersion !== 1) throw new Error("Invalid Product notification.");
  if (purpose === "product_availability") {
    if (!integer(value.enrollmentId) || !integer(value.generation) || !integer(value.transitionId)
      || typeof value.productId !== "string" || !NOTIFICATION_REQUEST_ID.test(value.productId) || !label(value.productName)
      || typeof value.productSlug !== "string" || value.productSlug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.productSlug)) throw new Error("Invalid Product notification.");
    return value as ProductAvailabilityReceipt;
  }
  if (purpose !== "product_waitlist_recovery" || !Array.isArray(value.links) || !value.links.length || value.links.length > MAX_RECOVERY_LINKS) throw new Error("Invalid Product recovery.");
  const identities = new Set<string>();
  for (const link of value.links) {
    if (!object(link) || !integer(link.enrollmentId) || !integer(link.generation) || typeof link.productId !== "string"
      || !NOTIFICATION_REQUEST_ID.test(link.productId) || !label(link.productName) || typeof link.token !== "string"
      || !NOTIFICATION_CAPABILITY.test(link.token) || typeof link.expiresAt !== "string" || link.expiresAt.length > 40
      || !Number.isFinite(Date.parse(link.expiresAt))) throw new Error("Invalid Product recovery.");
    const identity = `${link.enrollmentId}:${link.generation}`;
    if (identities.has(identity)) throw new Error("Invalid Product recovery.");
    identities.add(identity);
  }
  return value as ProductRecoveryReceipt;
}

export async function renderProductNotification(purpose: ProductNotificationPurpose, value: unknown, identity: EmailIdentity) {
  const origin = new URL(identity.siteOrigin);
  if (origin.origin !== identity.siteOrigin || origin.protocol !== "https:" || origin.username || origin.password
    || !isEmailAddress(identity.replyTo)) throw new Error("Invalid Product notification identity.");
  const receipt = parseReceipt(purpose, value);
  const managementUrl = new URL("/product-notifications", origin).href;
  const availability = "productSlug" in receipt ? receipt : null;
  const links = "links" in receipt ? receipt.links.map((link) => ({ ...link,
    url: `${managementUrl}?cancel=${link.token}`,
    expires: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(link.expiresAt)),
  })) : [];
  const subject = availability ? `[DEMO] helix — ${availability.productName} is ready for Checkout` : "helix — manage your Product notifications";
  const title = availability ? "Your requested Product update" : "Your Product notification links";
  const productUrl = availability ? new URL(`/products/${availability.productSlug}`, origin).href : null;
  const introduction = availability
    ? `${availability.productName} can now be added to a demo Checkout on the Helix development storefront. Checkout uses test payments. No goods will ship.`
    : "Someone requested private cancellation links for this email address. If that wasn’t you, you can ignore this message.";
  const detail = availability
    ? "You requested this one-time Product availability notification. Availability can change; view the current Product details before starting Checkout."
    : "Opening a link does not cancel anything. Choose a link and then confirm cancellation. Each link applies only to the named Product request and expires at the time shown.";
  const continuation = "Each email includes up to 20 requests. If you have additional Product requests, request links again after one minute. Requests are limited to three per address per hour. Later requests cover the next group; earlier unexpired links remain valid.";
  const text = [title, introduction, detail,
    ...(availability ? [`View ${availability.productName}: ${productUrl}`, `Manage Product notifications: ${managementUrl}`]
      : links.map((link) => `Cancel ${link.productName}: ${link.url}\nLink expires ${link.expires} UTC.`)),
    ...(!availability ? [continuation, `Request links: ${managementUrl}`] : []),
    "This does not change your marketing email preferences.", `Questions? ${identity.replyTo}`].join("\n\n");
  const html = await render(<html lang="en" dir="ltr"><head><title>{title}</title></head>
    <body style={{ margin: 0, padding: "24px 12px", backgroundColor: "#f5f4ef", color: "#171b18", fontFamily: "Manrope, Arial, sans-serif" }}>
      <table role="presentation" style={{ width: "100%", maxWidth: 600, margin: "0 auto", backgroundColor: "#ffffff", borderCollapse: "collapse" }}><tbody><tr><td style={{ padding: 28 }}>
        <p style={{ margin: "0 0 24px", fontFamily: "Marcellus, Georgia, serif", fontSize: 24 }}>helix</p>
        <h1 style={{ fontFamily: "Marcellus, Georgia, serif", fontSize: 28, fontWeight: 400 }}>{title}</h1>
        <p style={{ lineHeight: "24px" }}>{introduction}</p><p style={{ lineHeight: "24px" }}>{detail}</p>
        {availability ? <p><a style={{ color: "#245439" }} href={productUrl!}>View {availability.productName}</a></p>
          : links.map((link) => <div key={`${link.enrollmentId}:${link.generation}`} style={{ margin: "24px 0" }}>
            <p><a style={{ color: "#245439" }} href={link.url}>Cancel {link.productName}</a></p><p>Link expires {link.expires} UTC.</p>
          </div>)}
        {!availability && <p style={{ lineHeight: "24px" }}>{continuation}</p>}
        <p><a style={{ color: "#245439" }} href={managementUrl}>{availability ? "Manage Product notifications" : "Request links"}</a></p>
        <p style={{ lineHeight: "24px" }}>This does not change your marketing email preferences.</p>
        <p>Questions? <a style={{ color: "#245439" }} href={`mailto:${identity.replyTo}`}>{identity.replyTo}</a></p>
      </td></tr></tbody></table>
    </body></html>);
  return { subject, html, text };
}
