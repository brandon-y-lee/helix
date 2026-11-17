import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSupportReadinessCommand } from "./support-production/readiness-command";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { report, exitCode } = runSupportReadinessCommand(process.argv.slice(2), (path) => {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 || (stat.mode & 0o077) !== 0
        || (process.getuid && stat.uid !== process.getuid())) throw new Error("Private packet required.");
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = exitCode;
  } catch {
    console.error("Support readiness report unavailable. Use exact arguments and a private bounded nonsecret packet. No services were contacted or changed.");
    process.exitCode = 1;
  }
}
