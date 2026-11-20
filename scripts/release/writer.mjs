import pg from "pg";
import { HELIX_VERCEL_PROJECT_ID, SUPABASE_PROJECT_REFS } from "../../lib/supabase/project-safety.ts";
import { releaseConnection } from "../db/forward-migrations.mjs";

const projectRef = SUPABASE_PROJECT_REFS.production;
const role = "helix_release_controller";

export async function withReleaseWriter(env, run) {
  const { HELIX_RELEASE_DB_HOST: host, HELIX_RELEASE_DB_PASSWORD: password, HELIX_RELEASE_DB_CA: ca } = env;
  if (!password || !ca?.startsWith("-----BEGIN CERTIFICATE-----")) throw new Error("Missing release controller credentials.");
  const target = releaseConnection({ host, role, projectRef });
  const client = new pg.Client({
    host: target.hostname, port: 5432, database: "postgres", user: target.username, password,
    application_name: "helix-staged-release", ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10000, statement_timeout: 10000,
  });
  try {
    await client.connect();
    const { rows } = await client.query("select current_user as role, environment, project_ref from helix_release_control.read_environment()");
    if (rows.length !== 1 || rows[0].role !== role || rows[0].environment !== "production" || rows[0].project_ref !== projectRef) {
      throw new Error("Release controller target mismatch.");
    }
    return await run(async (action, release) => {
      const { rows: result } = await client.query(
        "select helix_release_control.transition_helix_release_authorization($1,$2,$3,$4,$5,$6) as accepted",
        [action, HELIX_VERCEL_PROJECT_ID, release.previousId, release.previousSha, release.candidateId, release.candidateSha],
      );
      return result.length === 1 && result[0].accepted === true;
    });
  } finally {
    await client.end();
  }
}
