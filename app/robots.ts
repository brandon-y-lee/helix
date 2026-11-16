import type { MetadataRoute } from "next";
import { resolvePublicSiteOrigin } from "@/lib/site-url";

const baseUrl = resolvePublicSiteOrigin();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
