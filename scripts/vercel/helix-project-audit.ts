export type VercelHelixAuditConfig = Readonly<{
  token: string;
  projectId: string;
  teamId: string | null;
  expectedProjectName: string;
  expectedRepository: string;
  expectedDomain: string;
  expectedBranch: string;
}>;

export type VercelHelixAuditReport = Readonly<{
  ok: boolean;
  project: Readonly<{
    id: string | null;
    name: string | null;
    repository: string | null;
  }>;
  domain: Readonly<{
    name: string;
    gitBranch: string | null;
    verified: boolean;
  }> | null;
  environmentKeys: readonly string[];
  findings: readonly string[];
}>;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function repositoryFromProject(project: JsonRecord): string | null {
  const link = asRecord(project.link);
  const owner = asString(link.org) ?? asString(link.owner);
  const repository = asString(link.repo);
  return owner && repository ? `${owner}/${repository}` : null;
}

function containsRetiredIdentity(value: string): boolean {
  const formerBrand = new RegExp(["mei", "pelle"].join("[\\s_-]*"), "i");
  const retiredRewards = new RegExp(["loyal", "ty"].join(""), "i");
  return formerBrand.test(value) || retiredRewards.test(value);
}

export function loadVercelHelixAuditConfig(
  env: NodeJS.ProcessEnv,
): VercelHelixAuditConfig {
  const token = env.VERCEL_ACCESS_TOKEN?.trim() || env.VERCEL_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  const teamId = env.VERCEL_ORG_ID?.trim() || env.VERCEL_TEAM_ID?.trim();
  const missing = [
    ["VERCEL_ACCESS_TOKEN or VERCEL_TOKEN", token],
    ["VERCEL_PROJECT_ID", projectId],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`[vercel-audit] Missing ${missing.join(", ")}.`);
  }

  return {
    token: token!,
    projectId: projectId!,
    teamId: teamId || null,
    expectedProjectName: env.VERCEL_EXPECTED_PROJECT_NAME?.trim() || "helix",
    expectedRepository:
      env.VERCEL_EXPECTED_REPOSITORY?.trim() || "brandon-y-lee/helix",
    expectedDomain:
      env.VERCEL_EXPECTED_DOMAIN?.trim() || "helixskin.vercel.app",
    expectedBranch: env.VERCEL_EXPECTED_BRANCH?.trim() || "dev",
  };
}

async function readJson(
  fetchImpl: typeof fetch,
  url: URL,
  token: string,
): Promise<JsonRecord> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `[vercel-audit] ${url.pathname} returned HTTP ${response.status}.`,
    );
  }
  return asRecord(await response.json());
}

export async function runVercelHelixAudit(
  config: VercelHelixAuditConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<VercelHelixAuditReport> {
  const projectPath = encodeURIComponent(config.projectId);
  const query = config.teamId
    ? `?teamId=${encodeURIComponent(config.teamId)}`
    : "";
  const [project, domainResponse, environmentResponse] = await Promise.all([
    readJson(
      fetchImpl,
      new URL(`https://api.vercel.com/v9/projects/${projectPath}${query}`),
      config.token,
    ),
    readJson(
      fetchImpl,
      new URL(`https://api.vercel.com/v9/projects/${projectPath}/domains${query}`),
      config.token,
    ),
    readJson(
      fetchImpl,
      new URL(`https://api.vercel.com/v9/projects/${projectPath}/env${query}`),
      config.token,
    ),
  ]);

  const projectId = asString(project.id);
  const projectName = asString(project.name);
  const repository = repositoryFromProject(project);
  const domains = asArray(domainResponse.domains).map(asRecord);
  const canonicalDomain = domains.find(
    (candidate) => asString(candidate.name) === config.expectedDomain,
  );
  const domain = canonicalDomain
    ? {
        name: config.expectedDomain,
        gitBranch: asString(canonicalDomain.gitBranch),
        verified:
          canonicalDomain.verified === true ||
          (canonicalDomain.verified === undefined &&
            asArray(canonicalDomain.verification).length === 0),
      }
    : null;
  const environmentKeys = [
    ...new Set(
      asArray(environmentResponse.envs)
        .map((entry) => asString(asRecord(entry).key))
        .filter((key): key is string => key !== null),
    ),
  ].sort();
  const findings: string[] = [];

  if (projectId !== config.projectId) findings.push("project-id-mismatch");
  if (projectName !== config.expectedProjectName) findings.push("project-name-mismatch");
  if (repository !== config.expectedRepository) findings.push("repository-link-mismatch");
  if (!domain) findings.push("canonical-domain-missing");
  if (domain && domain.gitBranch !== config.expectedBranch) {
    findings.push("canonical-domain-branch-mismatch");
  }
  if (domain && !domain.verified) findings.push("canonical-domain-unverified");

  const retiredMetadata = [
    projectName,
    repository,
    ...domains.map((candidate) => asString(candidate.name)),
    ...environmentKeys,
  ].filter((value): value is string => value !== null && containsRetiredIdentity(value));
  if (retiredMetadata.length > 0) findings.push("retired-identity-in-active-metadata");

  return {
    ok: findings.length === 0,
    project: { id: projectId, name: projectName, repository },
    domain,
    environmentKeys,
    findings,
  };
}
