export type MeasurementConfig = {
  verification?: boolean;
  origin: string;
  gaId: string;
  metaId: string;
  gaEnabled: boolean;
  metaEnabled: boolean;
  webAnalytics: boolean;
  speedInsights: boolean;
  vercelConfig?: string;
  vercelBasePath?: string;
};
export const measurementConfig: MeasurementConfig = {
  origin: process.env.NEXT_PUBLIC_HELIX_MEASUREMENT_ORIGIN ?? "",
  gaEnabled: process.env.NEXT_PUBLIC_HELIX_GA4_ENABLED === "true",
  metaEnabled: process.env.NEXT_PUBLIC_HELIX_META_ENABLED === "true",
  gaId: process.env.NEXT_PUBLIC_HELIX_GA4_ID ?? "",
  metaId: process.env.NEXT_PUBLIC_HELIX_META_PIXEL_ID ?? "",
  webAnalytics: process.env.NEXT_PUBLIC_HELIX_WEB_ANALYTICS_ENABLED === "true",
  speedInsights:
    process.env.NEXT_PUBLIC_HELIX_SPEED_INSIGHTS_ENABLED === "true",
  vercelConfig: process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG,
  vercelBasePath: process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH,
};
