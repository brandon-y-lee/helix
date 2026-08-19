import type { Metadata } from "next";

export const HELIX_SITE_NAME = "helix";

export function createPublicSiteMetadata({
  title,
  description,
  canonical,
}: {
  title: string;
  description?: string;
  canonical?: string;
}): Metadata {
  return {
    title,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      title,
      description,
      ...(canonical ? { url: canonical } : {}),
      siteName: HELIX_SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
