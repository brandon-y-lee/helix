import Link from "next/link";
import { notFound } from "next/navigation";
import { SupportConversation } from "@/components/admin/support/SupportConversation";
import styles from "@/components/admin/support/support.module.css";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { readSupportAiStatus } from "@/lib/support/ai";
import { getSupportInquiryForActor } from "@/lib/support/service";
import type { SupportAiStatus, SupportInquiryDetail } from "@/lib/support/types";

export const metadata = {
  title: "Support inquiry",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function SupportInquiryPage({ params }: { params: Promise<{ inquiryId: string }> }) {
  let inquiry: SupportInquiryDetail | null;
  let canReply = false;
  let initialAiStatus: SupportAiStatus = { available: false, job: null };
  try {
    const access = await requireAdminCapability("support.read");
    const { inquiryId } = await params;
    inquiry = await getSupportInquiryForActor(access.userId, inquiryId);
    canReply = access.capabilities.includes("support.reply");
    if (inquiry && canReply) {
      initialAiStatus = await readSupportAiStatus(access.userId, inquiryId).catch(() => ({ available: false, job: null }));
      if (initialAiStatus.inquiry?.id === inquiry.id && initialAiStatus.inquiry.revision >= inquiry.revision) inquiry = initialAiStatus.inquiry;
    }
  } catch {
    return (
      <section className={styles.panel} role="alert">
        <h1>Support inquiry unavailable</h1>
        <p>Support access or inquiry data could not be verified. Try again later.</p>
        <Link href="/admin/support" className={styles.textButton}>Back to Support Inbox</Link>
      </section>
    );
  }
  if (!inquiry) notFound();
  return <SupportConversation key={inquiry.id} initialInquiry={inquiry} canReply={canReply} initialAiStatus={initialAiStatus} />;
}
