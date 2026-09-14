import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "@/app/admin/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function VerificationLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1") {
    notFound();
  }
  return children;
}
