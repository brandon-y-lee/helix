import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductWaitlistVerification } from "@/components/waitlist/ProductWaitlistVerification";

export const metadata: Metadata = {
  title: "Product notification verification | helix",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ProductNotificationsVerificationPage() {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1")
    notFound();
  return <ProductWaitlistVerification />;
}
