import { permanentRedirect } from "next/navigation";

export default function ShippingRedirectPage() {
  permanentRedirect("/faq#shipping");
}
