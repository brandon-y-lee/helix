import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestReviewPage } from "@/components/reviews/GuestReviewPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review your purchase | helix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  if (
    process.env.HELIX_PUBLIC_REVIEWS_ENABLED !== "true" ||
    process.env.HELIX_GUEST_REVIEWS_ENABLED !== "true"
  )
    notFound();
  return <GuestReviewPage />;
}
