import { permanentRedirect } from "next/navigation";

export default function ReturnsExchangesRedirectPage() {
  permanentRedirect("/faq#returns");
}
