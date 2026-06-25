import { permanentRedirect } from "next/navigation";

export default function ShippingPolicyRedirectPage() {
  permanentRedirect("/faq#shipping");
}
