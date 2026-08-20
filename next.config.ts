import type { NextConfig } from "next";
import { CATALOG_MEDIA_BUCKET } from "./lib/catalog/media-storage";

const DAYS_PER_YEAR = 365;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * DAYS_PER_YEAR;
const IMMUTABLE_MEDIA_CACHE_CONTROL =
  `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
const HOME_VIDEO_PATHS = [
  "/media/home/helix-hero.webm",
  "/media/home/helix-hero.mp4",
  "/media/home/plug-and-play-loop.webm",
  "/media/home/plug-and-play-loop.mp4",
  "/media/home/final-cta-loop.webm",
  "/media/home/final-cta-loop.mp4",
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return HOME_VIDEO_PATHS.map((source) => ({
      source,
      headers: [
        {
          key: "Cache-Control",
          value: IMMUTABLE_MEDIA_CACHE_CONTROL,
        },
      ],
    }));
  },
  async redirects() {
    return [
      {
        source: "/method",
        destination: "/system",
        permanent: true,
      },
      {
        source: "/collections",
        destination: "/collections/shop",
        permanent: true,
      },
      {
        source: "/products",
        destination: "/collections/shop",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: `/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/**`,
      },
    ],
  },
};

export default nextConfig;
