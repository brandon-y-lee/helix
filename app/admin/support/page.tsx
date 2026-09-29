import { SupportInbox } from "@/components/admin/support/SupportInbox";
import styles from "@/components/admin/support/support.module.css";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { listSupportInquiriesForActor } from "@/lib/support/service";

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
  try {
    const access = await requireAdminCapability("support.read");
    const query = await searchParams ?? {};
    const status = query.status === "closed" || query.status === "all"
      ? query.status
      : "open";
    const parsedPage = typeof query.page === "string" && /^(0|[1-9]\d{0,3})$/.test(query.page)
      ? Number(query.page)
      : 0;
    const page = parsedPage <= 1000 ? parsedPage : 0;
    const inquiries = await listSupportInquiriesForActor(access.userId, { status, page });
    return <SupportInbox {...inquiries} status={status} page={page} />;
  } catch {
    return (
      <section className={styles.panel} role="alert">
        <h1>Support Inbox unavailable</h1>
        <p>Support access or inquiry data could not be verified. Try again later.</p>
      </section>
    );
  }
}
