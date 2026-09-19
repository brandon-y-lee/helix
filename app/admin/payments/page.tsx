import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_CAPABILITIES, checkAdminCapability } from "@/lib/admin/capabilities";
import { getPaymentOperations } from "@/lib/admin/payments/service";
import { authRedirectParam } from "@/lib/auth/redirect";
import { PaymentOperationsView } from "@/components/admin/payments/PaymentOperationsView";
import "./payments.css";

export const metadata: Metadata = {
  title: "Payments",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AdminPaymentsPage() {
  const access = await checkAdminCapability(ADMIN_CAPABILITIES.paymentsManage);
  if (access.status === "unauthenticated") redirect(authRedirectParam("/admin/payments"));
  if (access.status === "forbidden") {
    return <section className="admin-error"><h1>Payment access denied</h1><p>Your account does not have access to payment operations.</p></section>;
  }
  if (access.status === "unavailable") {
    return <section className="admin-error" role="alert"><h1>Payment access unavailable</h1><p>Payment access could not be verified. Try again later.</p></section>;
  }
  try {
    const operations = await getPaymentOperations();
    return <PaymentOperationsView operations={operations} />;
  } catch {
    return <section className="admin-error" role="alert"><h1>Payments unavailable</h1><p>Payment operations are temporarily unavailable. Refresh to try again.</p></section>;
  }
}
