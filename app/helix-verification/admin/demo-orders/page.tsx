import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminModules } from "@/lib/admin/modules";
import { VerificationAdminShell } from "../VerificationAdminShell";
import { DemoOrderVerification, type DemoOrderVerificationScenario } from "./DemoOrderVerification";

export const metadata: Metadata = {
  title: "Demo order verification | helix",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DemoOrderVerificationPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1") notFound();
  const query = await searchParams;
  const scenario = query.scenario ?? "default";
  if (Object.keys(query).some((key) => key !== "scenario")
    || typeof scenario !== "string"
    || !["default", "uncertain", "conflict", "lookup-error"].includes(scenario)) notFound();

  return (
    <VerificationAdminShell modules={getAdminModules(["orders.simulate"])} viewPath="/admin/demo-orders" navigationEnabled={false}>
      <DemoOrderVerification key={scenario} scenario={scenario as DemoOrderVerificationScenario} />
    </VerificationAdminShell>
  );
}
