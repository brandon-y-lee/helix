import { permanentRedirect } from "next/navigation";

export default function SupportRedirectPage() {
  permanentRedirect("/faq");
}
