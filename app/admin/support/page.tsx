import Link from "next/link";
import { SupportInbox } from "@/components/admin/support/SupportInbox";
import styles from "@/components/admin/support/support.module.css";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { listSupportInquiriesForActor } from "@/lib/support/service";
import { parseSupportInboxQuery, supportInboxHref } from "@/lib/support/pagination";
import type { SupportInquiryStatus } from "@/lib/support/types";

export const metadata = {
  title: "Support Inbox",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type InboxPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SupportInboxPage({ searchParams }: InboxPageProps) {
  let recoveryStatus: SupportInquiryStatus | "all" = "open";
  let hasCursor = false;
  try {
    const access = await requireAdminCapability("support.read");
    const query = await searchParams ?? {};
    recoveryStatus = query.status === "closed" || query.status === "all"
      ? query.status
      : "open";
    hasCursor = query.before !== undefined || query.after !== undefined || query.page !== undefined;
    const navigation = parseSupportInboxQuery(query);
    const inquiries = await listSupportInquiriesForActor(access.userId, navigation);
    return <SupportInbox {...inquiries} status={navigation.status} hasCursor={Boolean(navigation.cursor)} />;
  } catch {
    return (
      <section className={styles.panel} role="alert">
        <h1>Support Inbox unavailable</h1>
        <p>Support access or inquiry data could not be verified. Try again later.</p>
        {hasCursor && <Link href={supportInboxHref(recoveryStatus)} className={styles.textButton}>Newest inquiries</Link>}
      </section>
    );
  }
}
