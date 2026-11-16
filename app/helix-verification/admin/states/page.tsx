import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerificationAdminState } from "./VerificationAdminState";

export const metadata: Metadata = {
  title: "Admin state verification | helix",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminStatesVerificationPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (
    process.env.VERCEL === "1" ||
    process.env.HELIX_VERIFICATION_ADAPTER !== "1"
  ) {
    notFound();
  }

  const query = await searchParams;
  if (
    Object.keys(query).some((key) => key !== "scenario") ||
    (query.scenario !== undefined &&
      query.scenario !== "forbidden" &&
      query.scenario !== "unavailable" &&
      query.scenario !== "loading" &&
      query.scenario !== "error")
  ) {
    notFound();
  }

  return <VerificationAdminState scenario={query.scenario ?? "forbidden"} />;
}
