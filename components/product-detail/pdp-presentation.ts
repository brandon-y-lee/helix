export type PdpPresentation = "default" | "mobile-pilot";

const SUPER_SERUM_MOBILE_PILOT_SLUG = "super-serum";
export const PDP_MOBILE_PILOT_QUERY = "(max-width: 820px)";

/** Presentation follows canonical Product identity, never a Routine position. */
export function getPdpPresentation(canonicalSlug: string): PdpPresentation {
  return canonicalSlug === SUPER_SERUM_MOBILE_PILOT_SLUG
    ? "mobile-pilot"
    : "default";
}
