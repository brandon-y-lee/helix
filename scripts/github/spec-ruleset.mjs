export const SPEC_RULESET_NAME = "spec branch pull request integration";

export function desiredSpecRuleset(appId) {
  return {
    name: SPEC_RULESET_NAME,
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: ["refs/heads/codex/spec-*"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          allowed_merge_methods: ["squash"],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: "ci", integration_id: appId },
            { context: "affected-browser-verification", integration_id: appId },
            { context: "verification-system-browser-gate", integration_id: appId },
            { context: "verification-lifecycle-gate", integration_id: appId },
          ],
          strict_required_status_checks_policy: true,
          do_not_enforce_on_create: false,
        },
      },
    ],
  };
}

function containsDesired(value, desired) {
  if (Array.isArray(desired)) {
    return Array.isArray(value) &&
      value.length === desired.length &&
      desired.every((entry, index) => containsDesired(value[index], entry));
  }
  if (desired && typeof desired === "object") {
    return value &&
      typeof value === "object" &&
      Object.entries(desired).every(([key, entry]) => containsDesired(value[key], entry));
  }
  return value === desired;
}

export function assertDesiredSpecRuleset(ruleset) {
  const checks = ruleset?.rules?.find((rule) => rule.type === "required_status_checks")
    ?.parameters?.required_status_checks;
  const appId = checks?.[0]?.integration_id;
  if (!Number.isInteger(appId) || appId <= 0 || !containsDesired(ruleset, desiredSpecRuleset(appId))) {
    throw new Error("protected spec branch ruleset does not match the canonical audited configuration");
  }
}
