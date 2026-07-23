import type { Metadata } from "next";
import { AccountUnavailable } from "@/components/account/AccountUnavailable";
import { safeReturnTo } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Account unavailable | Mei Pelle",
};

export const dynamic = "force-dynamic";

export default async function AccountServiceUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return <AccountUnavailable retryHref={safeReturnTo(params.next)} />;
}
