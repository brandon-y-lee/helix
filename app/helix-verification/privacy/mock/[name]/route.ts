import { notFound } from "next/navigation";
import { privacyVerificationScripts } from "@/lib/privacy/verification-stubs";
export const dynamic = "force-dynamic";
function guard() {
  if (
    process.env.VERCEL === "1" ||
    process.env.HELIX_VERIFICATION_ADAPTER !== "1"
  )
    notFound();
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  guard();
  const { name } = await params;
  if (!Object.hasOwn(privacyVerificationScripts, name)) notFound();
  return new Response(privacyVerificationScripts[name], {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  guard();
  const { name } = await params;
  if (name !== "event") notFound();
  // No body is read, stored, logged or forwarded.
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
