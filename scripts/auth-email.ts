import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAuthEmailTemplates } from "../lib/email/auth-templates";
import { runAuthEmailCommand } from "./auth-email/operations";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAuthEmailCommand(process.argv.slice(2), process.env, buildAuthEmailTemplates).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.command === "verify" && !result.configurationMatches) process.exitCode = 1;
  }).catch(() => {
    console.error("Auth email inspection failed. Check command arguments, approved environment, and private credentials.");
    process.exitCode = 1;
  });
}
