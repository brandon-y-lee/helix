import { permanentRedirect } from "next/navigation";

export default function RefundPolicyRedirectPage() {
  permanentRedirect("/faq#returns");
}
