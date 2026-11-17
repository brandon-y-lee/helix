import { evaluateSupportReadiness } from "./readiness";
export function runSupportReadinessCommand(argv: string[], readPacket: (path: string) => unknown, now = Date.now()) {
  if (argv.length !== 4 || argv[0] !== "--candidate" || !/^[a-f0-9]{40}$/.test(argv[1])
    || argv[2] !== "--packet" || !argv[3] || argv[3].length > 4096) throw new Error("Invalid readiness arguments.");
  const report = evaluateSupportReadiness(readPacket(argv[3]), argv[1], now);
  // No zero exit: even complete assertion packets require actual operator qualification.
  return { report, exitCode: report.status === "blocked" ? 1 : 2 } as const;
}
