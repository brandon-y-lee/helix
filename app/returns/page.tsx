import { permanentRedirect } from "next/navigation";

export default function ReturnsRedirectPage() {
  permanentRedirect("/faq#returns");
}
