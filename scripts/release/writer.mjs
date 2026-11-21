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
    const pairIdentity = release => [HELIX_VERCEL_PROJECT_ID, release.previousId, release.previousSha, release.candidateId, release.candidateSha];
    async function admit(action, release, inspectionOnly) {
      const { rows } = await client.query(
        "select helix_release_control.admit_release($1,$2,$3,$4,$5,$6,$7) as accepted",
        [action, inspectionOnly, ...pairIdentity(release)],
      );
      return rows.length === 1 && rows[0].accepted === true;
    }
    async function change(action, release, failedRequestAt) {
      const pair = pairIdentity(release);
      const retry = action === "retry_rollback";
      if (retry && !Number.isSafeInteger(failedRequestAt)) throw new Error("Invalid provider request identity.");
      const { rows: result } = await client.query(
        retry ? "select helix_release_control.reserve_rollback_retry($1,$2,$3,$4,$5,$6) as accepted" :
          "select helix_release_control.transition_helix_release_authorization($1,$2,$3,$4,$5,$6) as accepted",
        retry ? [...pair, failedRequestAt] : [action, ...pair],
      );
      return result.length === 1 && result[0].accepted === true;
    }
    async function recorded({ id, sha }) {
      const { rows } = await client.query(
        "select previous_id, previous_sha, candidate_id, candidate_sha from helix_release_control.read_release_pair($1,$2)",
        [id ?? null, sha ?? null],
      );
      if (rows.length !== 1) throw new Error("No current release record matches the selected build.");
      return { previousId: rows[0].previous_id, previousSha: rows[0].previous_sha,
        candidateId: rows[0].candidate_id, candidateSha: rows[0].candidate_sha };
    }
    return await run({ admit, change, recorded });
  } finally {
    await client.end();
  }
}
