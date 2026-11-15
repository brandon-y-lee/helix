import { notFound } from "next/navigation";
import { ReviewVerification } from "./ReviewVerification";
export const dynamic = "force-dynamic";
export default function ReviewVerificationPage() {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1")
    notFound();
  return <ReviewVerification />;
}
