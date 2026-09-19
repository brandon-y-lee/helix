import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { runPaymentsPlan } from "./operations-plan";

export async function runPaymentsPlanCli(argv: string[], env: NodeJS.ProcessEnv) {
  if (argv.length && !(argv.length === 1 && argv[0] === "plan")) {
    throw new Error("[payments-plan] Only read-only plan is supported; activation belongs to the reviewed #413 manifest.");
  }
  return runPaymentsPlan(env);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
  runPaymentsPlanCli(process.argv.slice(2), process.env).then((report) => {
    console.log(JSON.stringify(report, null, 2));
  }).catch(() => {
    console.error("[payments-plan] Inspection unavailable or approved sandbox configuration mismatch. No changes made.");
    process.exitCode = 1;
  });
}
