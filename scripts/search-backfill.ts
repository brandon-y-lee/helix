import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const { runSearchBackfill, SearchBackfillError } = await import(
  "../lib/algolia/backfill"
);

try {
  const report = await runSearchBackfill({
    apply: !process.argv.slice(2).includes("--dry-run"),
  });
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} catch (error) {
  if (error instanceof SearchBackfillError) {
    console.error(
      JSON.stringify(
        { ok: false, error: error.message, ...error.report },
        null,
        2,
      ),
    );
  } else {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown backfill error",
          failed: 1,
        },
        null,
        2,
      ),
    );
  }
  process.exitCode = 1;
}
