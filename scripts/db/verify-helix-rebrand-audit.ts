import { resolve } from "node:path";
import { config as loadDotEnv } from "dotenv";
import { runHelixDatabaseAudit } from "./helix-rebrand-audit";

loadDotEnv({
  path: resolve(
    process.env.HELIX_REBRAND_ENV_FILE?.trim() ||
      resolve(process.cwd(), ".env.local"),
  ),
  quiet: true,
});

runHelixDatabaseAudit(process.env)
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
