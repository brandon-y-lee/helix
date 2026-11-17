// This scope is separate from historical sandbox and lifecycle consent.
export const PRODUCTION_MARKETING_WORDING_VERSION = "production_welcome_v1" as const;
export const PRODUCTION_MARKETING_WORDING = "I want to receive Helix welcome emails. This does not include behavior-based marketing or review requests. I can unsubscribe at any time.";
export const PRODUCTION_MARKETING_CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
export type ProductionMarketingEnvironment = Record<string, string | undefined>;
