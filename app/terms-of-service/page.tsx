import { permanentRedirect } from "next/navigation";

export default function LegacyTermsOfServicePage() {
  permanentRedirect("/terms");
}
