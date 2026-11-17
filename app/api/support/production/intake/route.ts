import { deployedIntake } from "@/lib/support/production/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = deployedIntake;
export const POST = deployedIntake;
