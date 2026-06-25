import { permanentRedirect } from "next/navigation";

export default function RewardsRedirectPage() {
  permanentRedirect("/faq#rewards");
}
