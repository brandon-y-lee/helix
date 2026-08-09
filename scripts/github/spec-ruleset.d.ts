export const SPEC_RULESET_NAME: string;
export function desiredSpecRuleset(appId: number): Record<string, unknown>;
export function assertDesiredSpecRuleset(ruleset: Record<string, unknown>): void;
