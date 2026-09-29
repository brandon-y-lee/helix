import Link from "next/link";
import { contactInquiryTypes } from "@/content/support/contact";
import type { SupportInquiryList, SupportInquiryStatus } from "@/lib/support/types";
import { supportInboxHref } from "@/lib/support/pagination";
import styles from "./support.module.css";

type InboxStatus = SupportInquiryStatus | "all";

const DELIVERY_LABELS: Readonly<Record<string, string>> = {
  queued: "Email queued",
  leased: "Email processing",
  retry: "Email retry pending",
  accepted: "Email accepted; delivery unconfirmed",
  sent: "Email sent; delivery unconfirmed",
  delivered: "Email delivered",
  delayed: "Email delivery delayed",
  delivery_delayed: "Email delivery delayed",
  bounced: "Email bounced",
  complained: "Email reported as spam",
  blocked: "Email blocked",
  suppressed: "Email suppressed",
  unsendable: "Email cannot be sent",
  uncertain: "Email outcome requires review",
  needs_review: "Email outcome requires review",
  failed: "Email failed",
  cancelled: "Email cancelled",
};

export function supportDeliveryLabel(state: string | null): string {
  if (state === null) return "No email delivery recorded";
  return Object.hasOwn(DELIVERY_LABELS, state)
    ? DELIVERY_LABELS[state]
    : "Email delivery status unavailable";
}

export function InquiryTime({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>Time unavailable</>;
  return (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date)} UTC
    </time>
  );
}

export function SupportInbox({
  inquiries,
  nextCursor,
  previousCursor,
  status,
  hasCursor,
}: SupportInquiryList & { status: InboxStatus; hasCursor: boolean }) {
  return (
    <section className={styles.panel} aria-labelledby="support-inbox-title">
      <header className={styles.header}>
        <h1 id="support-inbox-title">Support Inbox</h1>
        <p className={styles.muted}>Private customer inquiries and reply delivery.</p>
      </header>
      <nav className={styles.filters} aria-label="Filter inquiries">
        {(["open", "closed", "all"] as const).map((filter) => (
          <Link
            key={filter}
            href={supportInboxHref(filter)}
            className={styles.textButton}
            aria-current={status === filter ? "page" : undefined}
          >
            {filter === "all" ? "All" : filter === "open" ? "Open" : "Closed"}
          </Link>
        ))}
      </nav>
      <ul className={styles.list} aria-label="Support inquiries">
        {inquiries.map((inquiry) => (
          <li className={styles.row} key={inquiry.id}>
            <h2>
              <Link href={`/admin/support/${encodeURIComponent(inquiry.id)}`}>
                {inquiry.subject}
              </Link>
            </h2>
            <p className={styles.meta}>
              <span>{inquiry.name}</span> <span>{inquiry.email}</span>
            </p>
            <p className={styles.meta}>
              <span>{contactInquiryTypes.find((type) => type.value === inquiry.inquiryType)?.label ?? "Unclassified inquiry"}</span>
              <span className={styles.badge}>{inquiry.status === "open" ? "Open" : "Closed"}</span>
              {(inquiry.pendingInbound ?? 0) > 0 ? <span className={styles.badge}>Incoming content needs review</span> : null}
              <span>{supportDeliveryLabel(inquiry.lastDeliveryState)}</span>
            </p>
            <p className={styles.meta}>
              <span>Received <InquiryTime value={inquiry.createdAt} /></span>
              <span>Updated <InquiryTime value={inquiry.updatedAt} /></span>
            </p>
          </li>
        ))}
      </ul>
      {inquiries.length === 0 && (
        <p className={styles.empty}>No {status === "all" ? "" : `${status} `}inquiries in this view.</p>
      )}
      <nav className={styles.actions} aria-label="Inquiry navigation">
        {previousCursor !== null && (
          <Link href={supportInboxHref(status, previousCursor, "newer")} className={styles.textButton}>
            Newer inquiries
          </Link>
        )}
        {nextCursor !== null && (
          <Link href={supportInboxHref(status, nextCursor, "older")} className={styles.textButton}>
            Older inquiries
          </Link>
        )}
        {hasCursor && <Link href={supportInboxHref(status)} className={styles.textButton}>Newest inquiries</Link>}
      </nav>
    </section>
  );
}
