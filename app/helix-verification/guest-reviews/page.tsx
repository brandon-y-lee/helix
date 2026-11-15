import { notFound } from "next/navigation";
import { GuestReviewVerification } from "./GuestReviewVerification";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1")
    notFound();
  return <GuestReviewVerification />;
}
