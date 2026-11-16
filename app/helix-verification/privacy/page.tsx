import { notFound } from "next/navigation";
import { PrivacyVerification } from "./PrivacyVerification";
export const metadata = {
  title: "Privacy controls verification | helix",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function PrivacyVerificationPage() {
  if (
    process.env.VERCEL === "1" ||
    process.env.HELIX_VERIFICATION_ADAPTER !== "1"
  )
    notFound();
  return (
    <>
      <h1>Privacy controls verification</h1>
      <PrivacyVerification />
    </>
  );
}
